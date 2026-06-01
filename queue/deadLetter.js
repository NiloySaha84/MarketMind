import db from '../config/db.js';

// jobs that exhausted all retries land here for inspection
export const ensureDeadLetterTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS dead_letter_jobs (
            id SERIAL PRIMARY KEY,
            job_id TEXT,
            job_name TEXT NOT NULL,
            payload JSONB,
            failed_reason TEXT,
            attempts_made INT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
};

// best-effort — don't crash the worker if logging fails
export const moveToDeadLetter = async (job, err) => {
    try {
        await db.query(
            `INSERT INTO dead_letter_jobs (job_id, job_name, payload, failed_reason, attempts_made)
             VALUES ($1, $2, $3::jsonb, $4, $5)`,
            [
                job?.id ?? null,
                job?.name ?? 'unknown',
                JSON.stringify(job?.data ?? {}),
                err?.message ?? 'unknown error',
                job?.attemptsMade ?? 0
            ]
        );
        console.error(`[dlq] Job ${job?.id} (${job?.name}) exhausted retries -> moved to dead letter queue.`);
    } catch (error) {
        console.error('[dlq] Failed to record dead letter job:', error.message);
    }
};

// all BullMQ attempts used up
export const isExhausted = (job) => {
    if (!job) return false;
    const maxAttempts = job.opts?.attempts ?? 1;
    return job.attemptsMade >= maxAttempts;
};
