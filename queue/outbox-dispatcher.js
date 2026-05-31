import db from '../config/db.js';
import businessIdeaQueue from './server.js';
import { ensureOutboxTable } from './outbox.js';

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 2000;

let poller = null;

const enqueueOutboxRow = async (row, queryable = db) => {
    await businessIdeaQueue.add(row.job_type, row.payload, {
        jobId: `outbox-${row.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000
    });

    await queryable.query(
        `
        UPDATE outbox_jobs
        SET processed_at = NOW()
        WHERE id = $1
        `,
        [row.id]
    );
};

export const dispatchOutboxById = async (outboxId) => {
    let client;
    let inTransaction = false;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        inTransaction = true;

        const result = await client.query(
            `
            SELECT id, job_type, payload
            FROM outbox_jobs
            WHERE id = $1 AND processed_at IS NULL
            FOR UPDATE
            `,
            [outboxId]
        );

        if (result.rows.length === 0) {
            await client.query('COMMIT');
            inTransaction = false;
            return false;
        }

        await enqueueOutboxRow(result.rows[0], client);
        await client.query('COMMIT');
        inTransaction = false;
        console.log(`Dispatched outbox job ${outboxId} to BullMQ.`);
        return true;
    } catch (error) {
        if (client && inTransaction) {
            await client.query('ROLLBACK');
        }
        console.error(`Failed to dispatch outbox job ${outboxId}:`, error.message);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const dispatchOutboxBatch = async () => {
    let client;
    let inTransaction = false;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        inTransaction = true;

        const result = await client.query(
            `
            SELECT id, job_type, payload
            FROM outbox_jobs
            WHERE processed_at IS NULL
            ORDER BY id ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
            `,
            [BATCH_SIZE]
        );

        for (const row of result.rows) {
            await enqueueOutboxRow(row, client);
        }

        await client.query('COMMIT');
        inTransaction = false;

        if (result.rows.length > 0) {
            console.log(`Dispatched ${result.rows.length} outbox job(s).`);
        }

        return result.rows.length;
    } catch (error) {
        if (client && inTransaction) {
            await client.query('ROLLBACK');
        }
        console.error('Outbox dispatch failed:', error.message);
        return 0;
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const startOutboxDispatcher = async () => {
    if (poller) {
        return;
    }

    await ensureOutboxTable();
    console.log('Outbox dispatcher running.');

    await dispatchOutboxBatch();
    poller = setInterval(dispatchOutboxBatch, POLL_INTERVAL_MS);
};

const isMainModule = process.argv[1]?.endsWith('outbox-dispatcher.js');

if (isMainModule) {
    startOutboxDispatcher().catch((error) => {
        console.error('Failed to start outbox dispatcher:', error.message);
        process.exit(1);
    });
}
