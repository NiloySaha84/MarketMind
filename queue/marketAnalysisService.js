import OpenAI from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL } from '../config/env.js';
import { searchWeb } from './tavilyService.js';
import { callWithResilience, openAiBreaker } from '../lib/resilience.js';

const MARKET_SIZE_UNIT = 'USD_million';

const MARKET_ANALYSIS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        market_size: {
            type: ['number', 'null'],
            description: 'Estimated current market size expressed in MILLIONS of USD (e.g. 12700 means $12.7 billion; 500 means $500 million).'
        },
        five_year_projection: {
            type: ['number', 'null'],
            description: 'Estimated market size five years from now, expressed in MILLIONS of USD (same unit as market_size).'
        },
        growth_per_year: {
            type: ['number', 'null'],
            description: 'Estimated average annual growth rate as a percentage (e.g. 12.5 for 12.5%).'
        }
    },
    required: ['market_size', 'five_year_projection', 'growth_per_year']
};

const buildSourcesBlock = (sources) =>
    sources
        .map((s, i) => `[${i + 1}] ${s.title || s.domain || s.url}\nURL: ${s.url}\nExcerpt: ${(s.snippet || '').slice(0, 800)}`)
        .join('\n\n');

const buildPrompt = (ideaDescription, targetMarket, sources) => `
You are a market research analyst. Using ONLY the web sources provided below, estimate the market opportunity for this business idea.

Business idea: ${ideaDescription}
Target market: ${targetMarket}

Sources:
${buildSourcesBlock(sources)}

Provide realistic estimates grounded in the sources:
- market_size: current total addressable market size, in MILLIONS of USD (numeric only)
- five_year_projection: projected market size five years from now, in MILLIONS of USD
- growth_per_year: average annual growth rate as a percentage number (e.g. 8.25 for 8.25%)

UNIT RULES (critical):
- ALWAYS express market_size and five_year_projection in MILLIONS of USD.
- Convert before answering: $1 billion = 1000; $12.7 billion = 12700; $500 million = 500; $9.4 billion = 9400.
- Output numbers only (no "$", "B", "M", commas, or text).

Rules:
- Base every figure on the sources above; do not invent numbers that are unsupported.
- If the sources do not support a reasonable estimate for a field, return null for that field.
`.trim();

const callOpenAI = async (ideaDescription, targetMarket, sources) => {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const model = OPENAI_MODEL || 'gpt-4o-mini';

    const response = await callWithResilience(
        openAiBreaker,
        () =>
            client.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: 'You output JSON only. Provide conservative, realistic market estimates grounded only in the provided sources.' },
                    { role: 'user', content: buildPrompt(ideaDescription, targetMarket, sources) }
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'MarketAnalysisResult',
                        strict: true,
                        schema: MARKET_ANALYSIS_SCHEMA
                    }
                },
                temperature: 0.2
            }),
        { label: 'openai:market' }
    );

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('OpenAI returned empty content');
    }

    return JSON.parse(content);
};

const buildSourceString = (sources) => {
    const urls = [...new Set(sources.map((s) => s.url).filter(Boolean))];
    return urls.length > 0 ? urls.join(', ') : 'tavily:none';
};

const emptyResult = (source, raw, sources = []) => ({
    market_size: null,
    five_year_projection: null,
    growth_per_year: null,
    market_size_unit: MARKET_SIZE_UNIT,
    sources,
    source,
    raw
});

export const analyzeMarket = async ({ ideaDescription, targetMarket }) => {
    if (!OPENAI_API_KEY) {
        console.warn('[marketAnalysisService] OPENAI_API_KEY not set; returning empty analysis.');
        return emptyResult('fallback:none', { reason: 'missing_api_key' });
    }

    let sources = [];
    try {
        const query = `market size, total addressable market, and annual growth rate for: ${ideaDescription} (target market: ${targetMarket})`;
        sources = await searchWeb(query, { maxResults: 5, fetchCount: 10 });

        if (sources.length === 0) {
            console.warn('[marketAnalysisService] No web sources found; skipping market analysis.');
            return emptyResult('fallback:no_sources', { reason: 'no_sources' });
        }

        const parsed = await callOpenAI(ideaDescription, targetMarket, sources);

        return {
            market_size: parsed.market_size,
            five_year_projection: parsed.five_year_projection,
            growth_per_year: parsed.growth_per_year,
            market_size_unit: MARKET_SIZE_UNIT,
            sources,
            source: buildSourceString(sources),
            raw: { ...parsed, market_size_unit: MARKET_SIZE_UNIT, sources }
        };
    } catch (error) {
        console.error('[marketAnalysisService] failed:', error.message);
        return emptyResult('fallback:error', { error: error.message, sources }, sources);
    }
};
