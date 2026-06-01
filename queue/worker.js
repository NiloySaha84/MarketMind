import { Worker } from 'bullmq';
import db from '../config/db.js';
import { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } from '../config/env.js';
import { findCompetitors } from './competitorService.js';
import { analyzeMarket } from './marketAnalysisService.js';
import { deleteCache } from '../cache.js';
import { generateReportIfReady } from '../finalReport.js';
import { ensureDeadLetterTable, moveToDeadLetter, isExhausted } from './deadLetter.js';

const QUEUE_NAME = 'businessIdeaQueue';

const connection = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    db: 0
};

const getJobPayload = (job) => {
    const { id: businessId, idea_des: ideaDescription, target_market: targetMarket } = job.data || {};

    if (!businessId || !ideaDescription || !targetMarket) {
        throw new Error('Job missing required fields: id, idea_des, target_market');
    }

    return { businessId, ideaDescription, targetMarket };
};

// try to build the final report + bust cache after each analysis job
const finalizeAnalysis = async (businessId, userId) => {
    try {
        const result = await generateReportIfReady(businessId);
        if (result) {
            console.log(`[worker:report] business_id=${businessId} -> final report generated.`);
        }
    } catch (error) {
        console.error(`[worker:report] Failed to generate report for business_id=${businessId}:`, error.message);
    }

    try {
        await deleteCache(`cache:businessIdeas:${userId}`);
        await deleteCache(`cache:businessIdea:${userId}:${businessId}`);
    } catch (error) {
        console.error('Failed to delete cache:', error.message);
    }
};

const insertNoCompetitorsRow = async (client, businessId, source, raw) => {
    await client.query(
        `INSERT INTO competitors (business_id, name, website, source, strengths, weaknesses, raw_data)
         VALUES ($1, $2, NULL, $3, NULL, NULL, $4::jsonb)`,
        [businessId, 'None', source, JSON.stringify(raw ?? {})]
    );
};

const insertCompetitorRow = async (client, businessId, competitor, source, raw) => {
    const strengths = competitor.strength ? JSON.stringify([competitor.strength]) : null;
    const weaknesses = competitor.weakness ? JSON.stringify([competitor.weakness]) : null;

    await client.query(
        `INSERT INTO competitors (business_id, name, website, source, strengths, weaknesses, raw_data)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
        [
            businessId,
            competitor.name,
            competitor.website || null,
            source,
            strengths,
            weaknesses,
            JSON.stringify(raw ?? {})
        ]
    );
};

export const processBusinessIdeaJob = async (job) => {
    const { businessId, ideaDescription, targetMarket } = getJobPayload(job);

    console.log(`[worker:competitors] Processing business_id=${businessId}, job=${job.id}`);

    const { competitors, source, raw } = await findCompetitors({ ideaDescription, targetMarket });

    let client;
    let inTransaction = false;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        inTransaction = true;

        await client.query('DELETE FROM competitors WHERE business_id = $1', [businessId]);

        if (!competitors || competitors.length === 0) {
            await insertNoCompetitorsRow(client, businessId, source, raw);
            console.log(`[worker:competitors] business_id=${businessId} -> no competitors found, inserted "None".`);
        } else {
            for (const competitor of competitors) {
                await insertCompetitorRow(client, businessId, competitor, source, raw);
            }
            console.log(`[worker:competitors] business_id=${businessId} -> inserted ${competitors.length} competitor(s).`);
        }

        await client.query('COMMIT');
        inTransaction = false;

        await finalizeAnalysis(businessId, job.data.user_id);

        return { businessId, inserted: competitors.length || 1, source };
    } catch (error) {
        if (client && inTransaction) {
            await client.query('ROLLBACK');
        }
        console.error(`[worker:competitors] Failed for business_id=${businessId}:`, error.message);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const processMarketAnalysisJob = async (job) => {
    const { businessId, ideaDescription, targetMarket } = getJobPayload(job);

    console.log(`[worker:market] Processing business_id=${businessId}, job=${job.id}`);

    const { market_size, five_year_projection, growth_per_year, market_size_unit, source, raw } = await analyzeMarket({
        ideaDescription,
        targetMarket
    });

    let client;
    let inTransaction = false;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        inTransaction = true;

        await client.query('DELETE FROM market_analysis WHERE business_id = $1', [businessId]);

        await client.query(
            `INSERT INTO market_analysis (business_id, market_size, five_year_projection, growth_per_year, market_size_unit, source, raw_output)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
            [
                businessId,
                market_size,
                five_year_projection,
                growth_per_year,
                market_size_unit || 'USD_million',
                source,
                JSON.stringify({ source, ...raw })
            ]
        );

        await client.query('COMMIT');
        inTransaction = false;

        await finalizeAnalysis(businessId, job.data.user_id);

        console.log(`[worker:market] business_id=${businessId} -> market analysis saved.`);
        return { businessId, market_size, five_year_projection, growth_per_year, market_size_unit, source };
    } catch (error) {
        if (client && inTransaction) {
            await client.query('ROLLBACK');
        }
        console.error(`[worker:market] Failed for business_id=${businessId}:`, error.message);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
};

const jobHandlers = {
    processBusinessIdea: processBusinessIdeaJob,
    processMarketAnalysis: processMarketAnalysisJob
};

let worker = null;

export const startBusinessIdeaWorker = () => {
    if (worker) {
        return worker;
    }

    ensureDeadLetterTable().catch((error) => {
        console.error('[dlq] Failed to initialize dead_letter_jobs table:', error.message);
    });

    worker = new Worker(
        QUEUE_NAME,
        async (job) => {
            const handler = jobHandlers[job.name];
            if (!handler) {
                console.log(`[worker] Skipping unsupported job type: ${job.name}`);
                return;
            }
            return handler(job);
        },
        { connection, concurrency: 20 }
    );

    worker.on('completed', (job, result) => {
        console.log(`[worker] Completed job ${job.id} (${job.name}):`, result);
    });

    worker.on('failed', async (job, err) => {
        console.error(`[worker] Failed job ${job?.id} (${job?.name}):`, err?.message);
        // only dead-letter after the last retry
        if (isExhausted(job)) {
            await moveToDeadLetter(job, err);
        }
    });

    worker.on('ready', () => {
        console.log(`[worker] Listening on queue "${QUEUE_NAME}"`);
    });

    return worker;
};

export const startCompetitorWorker = startBusinessIdeaWorker;

export const stopBusinessIdeaWorker = async () => {
    if (worker) {
        await worker.close();
        worker = null;
    }
};

export const stopCompetitorWorker = stopBusinessIdeaWorker;

const isMainModule = process.argv[1]?.endsWith('worker.js');

if (isMainModule) {
    startBusinessIdeaWorker();

    const shutdown = async () => {
        console.log('[worker] Shutting down...');
        await stopBusinessIdeaWorker();
        await db.end();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

export default {
    startBusinessIdeaWorker,
    stopBusinessIdeaWorker,
    processBusinessIdeaJob,
    processMarketAnalysisJob
};
