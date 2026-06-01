import OpenAI from 'openai';
import { TAVILY_API_KEY, OPENAI_API_KEY } from '../config/env.js';
import { callWithResilience, openAiBreaker, tavilyBreaker } from '../lib/resilience.js';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const EMBEDDING_MODEL = 'text-embedding-3-small';

export const toDomain = (url) => {
    if (!url) return null;
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
};

const cosineSimilarity = (a, b) => {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const fetchTavily = async (query, fetchCount) => {
    const response = await fetch(TAVILY_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TAVILY_API_KEY}`
        },
        body: JSON.stringify({
            query,
            search_depth: 'advanced',
            max_results: fetchCount
        })
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        const error = new Error(`Tavily request failed: ${response.status} ${body}`.trim());
        error.status = response.status; // so retry logic sees 429/5xx
        throw error;
    }

    const data = await response.json();
    return Array.isArray(data.results) ? data.results : [];
};

// rerank by embedding similarity to the query
const rerank = async (query, candidates, maxResults) => {
    if (candidates.length === 0) return [];
    if (!OPENAI_API_KEY) {
        // no OpenAI key — use Tavily's score
        return [...candidates]
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .slice(0, maxResults);
    }

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const docs = candidates.map((c) => `${c.title ?? ''}\n${c.content ?? ''}`.trim());

    const embeddingResponse = await callWithResilience(
        openAiBreaker,
        () =>
            client.embeddings.create({
                model: EMBEDDING_MODEL,
                input: [query, ...docs]
            }),
        { label: 'openai:embeddings' }
    );

    const [queryEmbedding, ...docEmbeddings] = embeddingResponse.data.map((d) => d.embedding);

    return candidates
        .map((candidate, i) => ({
            ...candidate,
            rerankScore: cosineSimilarity(queryEmbedding, docEmbeddings[i])
        }))
        .sort((a, b) => b.rerankScore - a.rerankScore)
        .slice(0, maxResults);
};

/**
 * Retrieve web sources for a query, rerank them, and return the most relevant.
 * Always fails soft: returns an empty array on missing key or any error.
 */
export const searchWeb = async (query, { maxResults = 5, fetchCount = 10 } = {}) => {
    if (!TAVILY_API_KEY) {
        console.warn('[tavilyService] TAVILY_API_KEY not set; returning no sources.');
        return [];
    }

    try {
        const rawResults = await callWithResilience(
            tavilyBreaker,
            () => fetchTavily(query, fetchCount),
            { label: 'tavily:search' }
        );
        const reranked = await rerank(query, rawResults, maxResults);

        return reranked.map((r) => ({
            title: r.title ?? null,
            url: r.url ?? null,
            snippet: r.content ?? null,
            domain: toDomain(r.url),
            score: r.score ?? null,
            rerankScore: r.rerankScore ?? null
        }));
    } catch (error) {
        console.error('[tavilyService] search failed:', error.message);
        return [];
    }
};

export default { searchWeb, toDomain };
