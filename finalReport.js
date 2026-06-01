import OpenAI from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL } from './config/env.js';
import db from './config/db.js';
import { callWithResilience, openAiBreaker } from './lib/resilience.js';
import { setRLSUser } from './lib/dbSession.js';

const model = OPENAI_MODEL || 'gpt-4o-mini';

// saved as report.final_summary
const FINAL_REPORT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        executive_summary: {
            type: 'string',
            description:
                '2-4 sentences: overall assessment of the business idea and whether it looks viable in the target market.'
        },
        market_opportunity: {
            type: 'string',
            description:
                'Paragraph on market size, growth, and timing. Use the provided market analysis figures when available; note gaps if data is missing.'
        },
        competitive_landscape: {
            type: 'string',
            description:
                'Paragraph on key competitors, differentiation, and positioning. Use the provided competitor list when available.'
        },
        risks_and_challenges: {
            type: 'string',
            description:
                'Bullet-style or short paragraph on main risks, barriers to entry, and execution challenges.'
        },
        recommendation: {
            type: 'string',
            description:
                'Clear recommendation: pursue, refine, or reconsider, with 2-3 sentences of rationale.'
        },
        final_summary: {
            type: 'string',
            description:
                'Full markdown report for database storage. Combine all sections above using ## headings: ' +
                'Executive Summary, Market Opportunity, Competitive Landscape, Risks and Challenges, Recommendation. ' +
                'Do not invent facts; base the report only on the business idea and analysis data provided in the prompt.'
        }
    },
    required: [
        'executive_summary',
        'market_opportunity',
        'competitive_landscape',
        'risks_and_challenges',
        'recommendation',
        'final_summary'
    ]
};

const buildCompetitorsBlock = (competitors = []) => {
    if (!Array.isArray(competitors) || competitors.length === 0) {
        return 'No competitor data available.';
    }

    return competitors
        .map((c, i) => {
            const strengths = Array.isArray(c.strengths) ? c.strengths.join('; ') : c.strengths || 'n/a';
            const weaknesses = Array.isArray(c.weaknesses) ? c.weaknesses.join('; ') : c.weaknesses || 'n/a';
            return `${i + 1}. ${c.name || 'Unknown'} (${c.website || 'no website'})\n   Strengths: ${strengths}\n   Weaknesses: ${weaknesses}`;
        })
        .join('\n');
};

const buildMarketBlock = (marketAnalysis = []) => {
    if (!Array.isArray(marketAnalysis) || marketAnalysis.length === 0) {
        return 'No market analysis data available.';
    }

    return marketAnalysis
        .map((m) => {
            const unit = m.market_size_unit || 'USD_million';
            return [
                `Market size: ${m.market_size ?? 'n/a'} (${unit})`,
                `Five-year projection: ${m.five_year_projection ?? 'n/a'} (${unit})`,
                `Growth per year: ${m.growth_per_year ?? 'n/a'}%`
            ].join('\n');
        })
        .join('\n');
};

const buildPrompt = (businessIdea) => `
You are a startup analyst. Using ONLY the data provided below, write a concise, realistic investment-style report for this business idea.

Business idea: ${businessIdea.idea_des || 'n/a'}
Target market: ${businessIdea.target_market || 'n/a'}

Competitors:
${buildCompetitorsBlock(businessIdea.competitors)}

Market analysis:
${buildMarketBlock(businessIdea.market_analysis)}

Rules:
- Base every statement on the data above; do not invent competitors, numbers, or facts.
- If a section lacks supporting data, say so plainly instead of guessing.
- Keep the tone objective and practical.
- The "final_summary" field must be a complete markdown document combining all sections with ## headings.
`.trim();

const callOpenAI = async (businessIdea) => {
    // lazy init — worker can import this without an API key
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const response = await callWithResilience(
        openAiBreaker,
        () =>
            client.chat.completions.create({
                model,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You output JSON only. Provide an objective, realistic assessment grounded only in the provided data. Never fabricate competitors or figures.'
                    },
                    { role: 'user', content: buildPrompt(businessIdea) }
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'FinalReportResult',
                        strict: true,
                        schema: FINAL_REPORT_SCHEMA
                    }
                },
                temperature: 0.3
            }),
        { label: 'openai:final-report' }
    );

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('OpenAI returned empty content');
    }

    return JSON.parse(content);
};

// report table has RLS — set app.user_id in the transaction
const saveReport = async (businessId, userId, finalSummary) => {
    let client;
    let inTransaction = false;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        inTransaction = true;

        await setRLSUser(client, userId);

        // one report per idea
        await client.query('DELETE FROM report WHERE business_id = $1', [businessId]);

        const result = await client.query(
            'INSERT INTO report (business_id, final_summary) VALUES ($1, $2) RETURNING *',
            [businessId, finalSummary]
        );

        await client.query('COMMIT');
        inTransaction = false;

        return result.rows[0];
    } catch (error) {
        if (client && inTransaction) {
            await client.query('ROLLBACK');
        }
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
};

const generateFinalReport = async (businessIdea) => {
    if (!businessIdea || !businessIdea.id) {
        throw new Error('generateFinalReport requires a business idea with an id');
    }
    if (!businessIdea.user_id) {
        throw new Error('generateFinalReport requires the business idea user_id (needed for report row-level security)');
    }
    if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not set; cannot generate final report');
    }

    const parsed = await callOpenAI(businessIdea);
    const savedReport = await saveReport(businessIdea.id, businessIdea.user_id, parsed.final_summary);

    return {
        report: savedReport,
        sections: {
            executive_summary: parsed.executive_summary,
            market_opportunity: parsed.market_opportunity,
            competitive_landscape: parsed.competitive_landscape,
            risks_and_challenges: parsed.risks_and_challenges,
            recommendation: parsed.recommendation
        }
    };
};

// only runs when both competitor + market rows exist; null if still waiting
const generateReportIfReady = async (businessId) => {
    const ideaResult = await db.query('SELECT * FROM business_idea WHERE id = $1', [businessId]);
    if (ideaResult.rows.length === 0) {
        return null;
    }
    const idea = ideaResult.rows[0];

    const [competitorsResult, marketResult] = await Promise.all([
        db.query('SELECT * FROM competitors WHERE business_id = $1 ORDER BY created_at DESC, id DESC', [businessId]),
        db.query('SELECT * FROM market_analysis WHERE business_id = $1 ORDER BY created_at DESC, id DESC', [businessId])
    ]);

    if (competitorsResult.rows.length === 0 || marketResult.rows.length === 0) {
        return null;
    }

    const businessIdea = {
        id: idea.id,
        user_id: idea.user_id,
        idea_des: idea.idea_des,
        target_market: idea.target_market,
        competitors: competitorsResult.rows.map((c) => ({
            name: c.name,
            website: c.website,
            strengths: c.strengths,
            weaknesses: c.weaknesses
        })),
        market_analysis: marketResult.rows.map((m) => ({
            market_size: m.market_size,
            five_year_projection: m.five_year_projection,
            growth_per_year: m.growth_per_year,
            market_size_unit: m.market_size_unit
        }))
    };

    return generateFinalReport(businessIdea);
};

export { FINAL_REPORT_SCHEMA, generateFinalReport, generateReportIfReady };
