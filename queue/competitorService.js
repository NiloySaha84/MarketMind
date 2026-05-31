import OpenAI from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL } from '../config/env.js';
import { searchWeb } from './tavilyService.js';
import { callWithResilience, openAiBreaker } from '../lib/resilience.js';

const COMPETITOR_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        competitors: {
            type: 'array',
            description: 'Up to 5 real competitor companies grounded in the provided sources. Empty array if none are supported by the sources.',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    name: { type: 'string' },
                    website: { type: ['string', 'null'] },
                    strength: { type: ['string', 'null'] },
                    weakness: { type: ['string', 'null'] }
                },
                required: ['name', 'website', 'strength', 'weakness']
            }
        }
    },
    required: ['competitors']
};

const buildSourcesBlock = (sources) =>
    sources
        .map((s, i) => `[${i + 1}] ${s.title || s.domain || s.url}\nURL: ${s.url}\nExcerpt: ${(s.snippet || '').slice(0, 800)}`)
        .join('\n\n');

const buildPrompt = (ideaDescription, targetMarket, sources) => `
You are a market analyst. Using ONLY the web sources provided below, identify up to 5 real, well-known competitors operating in this space.

Business idea: ${ideaDescription}
Target market: ${targetMarket}

Sources:
${buildSourcesBlock(sources)}

Rules:
- Only list real companies that are explicitly supported by the sources above.
- Do NOT use prior knowledge or invent companies that are not in the sources.
- If the sources do not clearly support any competitor, return an empty array.
- For each competitor provide: name, website (official URL or null), one short strength, one short weakness.
- Keep strengths and weaknesses to one sentence each.
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
                    { role: 'system', content: 'You output JSON only. Be conservative; never fabricate companies. Use only the provided sources.' },
                    { role: 'user', content: buildPrompt(ideaDescription, targetMarket, sources) }
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'CompetitorsResult',
                        strict: true,
                        schema: COMPETITOR_SCHEMA
                    }
                },
                temperature: 0.2
            }),
        { label: 'openai:competitors' }
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

export const findCompetitors = async ({ ideaDescription, targetMarket }) => {
    if (!OPENAI_API_KEY) {
        console.warn('[competitorService] OPENAI_API_KEY not set; returning no competitors.');
        return { competitors: [], sources: [], source: 'fallback:none', raw: { reason: 'missing_api_key' } };
    }

    let sources = [];
    try {
        const query = `top competitors and companies for: ${ideaDescription} (target market: ${targetMarket})`;
        sources = await searchWeb(query, { maxResults: 5, fetchCount: 10 });

        if (sources.length === 0) {
            console.warn('[competitorService] No web sources found; skipping competitor extraction.');
            return { competitors: [], sources: [], source: 'fallback:no_sources', raw: { reason: 'no_sources' } };
        }

        const parsed = await callOpenAI(ideaDescription, targetMarket, sources);
        const competitors = Array.isArray(parsed.competitors) ? parsed.competitors.slice(0, 5) : [];

        return {
            competitors,
            sources,
            source: buildSourceString(sources),
            raw: { ...parsed, sources }
        };
    } catch (error) {
        console.error('[competitorService] failed:', error.message);
        return { competitors: [], sources, source: 'fallback:error', raw: { error: error.message, sources } };
    }
};
