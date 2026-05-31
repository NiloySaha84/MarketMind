import db from '../config/db.js';

export const ensureOutboxTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS outbox_jobs (
            id SERIAL PRIMARY KEY,
            job_type TEXT NOT NULL,
            payload JSONB NOT NULL,
            processed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE INDEX IF NOT EXISTS idx_outbox_jobs_unprocessed
        ON outbox_jobs (id)
        WHERE processed_at IS NULL
    `);
};
