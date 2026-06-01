// outbox -> BullMQ -> worker. import use-worker-role first (bia_worker role).
import '../helpers/use-worker-role.js';

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import db from '../../config/db.js';
import redis from '../../config/redis.js';
import businessIdeaQueue from '../../queue/server.js';
import { dispatchOutboxById, dispatchOutboxBatch } from '../../queue/outbox-dispatcher.js';
import {
    startBusinessIdeaWorker,
    stopBusinessIdeaWorker
} from '../../queue/worker.js';
import {
    resetDatabase,
    seedUser,
    seedBusinessIdea,
    adminQuery,
    countRows,
    closeAdmin
} from '../helpers/testdb.js';

const waitFor = async (predicate, { timeoutMs = 15000, intervalMs = 200 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await predicate()) return true;
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
};

const insertOutboxRow = async (jobType, payload) => {
    const { rows } = await adminQuery(
        'INSERT INTO outbox_jobs (job_type, payload) VALUES ($1, $2::jsonb) RETURNING id',
        [jobType, JSON.stringify(payload)]
    );
    return rows[0].id;
};

describe('outbox dispatcher + worker pipeline', () => {
    before(async () => {
        await businessIdeaQueue.obliterate({ force: true }).catch(() => {});
    });

    beforeEach(async () => {
        await resetDatabase();
        await businessIdeaQueue.obliterate({ force: true }).catch(() => {});
    });

    after(async () => {
        await stopBusinessIdeaWorker();
        await businessIdeaQueue.obliterate({ force: true }).catch(() => {});
        await businessIdeaQueue.close();
        await redis.quit();
        await db.end();
        await closeAdmin();
    });

    describe('dispatchOutboxById', () => {
        test('enqueues the job to BullMQ and marks the outbox row processed', async () => {
            const user = await seedUser({ email: 'disp@example.com' });
            const idea = await seedBusinessIdea({ userId: user.id });
            const outboxId = await insertOutboxRow('processBusinessIdea', {
                id: idea.id,
                idea_des: idea.idea_des,
                target_market: idea.target_market,
                user_id: user.id
            });

            const dispatched = await dispatchOutboxById(outboxId);
            assert.equal(dispatched, true);

            // job id matches outbox row
            const job = await businessIdeaQueue.getJob(`outbox-${outboxId}`);
            assert.ok(job, 'expected a BullMQ job to be created');
            assert.equal(job.name, 'processBusinessIdea');

            // outbox marked processed
            const { rows } = await adminQuery('SELECT processed_at FROM outbox_jobs WHERE id = $1', [outboxId]);
            assert.ok(rows[0].processed_at, 'expected processed_at to be set');
        });

        test('returns false for an already-processed / missing row', async () => {
            const dispatched = await dispatchOutboxById(987654);
            assert.equal(dispatched, false);
        });
    });

    describe('dispatchOutboxBatch', () => {
        test('dispatches all unprocessed rows and skips processed ones', async () => {
            const user = await seedUser({ email: 'batch@example.com' });
            const idea = await seedBusinessIdea({ userId: user.id });
            const payload = {
                id: idea.id,
                idea_des: idea.idea_des,
                target_market: idea.target_market,
                user_id: user.id
            };

            await insertOutboxRow('processBusinessIdea', payload);
            await insertOutboxRow('processMarketAnalysis', payload);

            const count = await dispatchOutboxBatch();
            assert.equal(count, 2);

            // nothing left to dispatch
            const second = await dispatchOutboxBatch();
            assert.equal(second, 0);

            const { rows } = await adminQuery(
                'SELECT COUNT(*)::int AS n FROM outbox_jobs WHERE processed_at IS NULL'
            );
            assert.equal(rows[0].n, 0);
        });
    });

    describe('worker consumption (offline AI fallback)', () => {
        test('processes both jobs and writes competitor + market rows', async () => {
            const user = await seedUser({ email: 'worker@example.com' });
            const idea = await seedBusinessIdea({ userId: user.id, idea: 'Solar drones', targetMarket: 'Farms' });
            const payload = {
                id: idea.id,
                idea_des: idea.idea_des,
                target_market: idea.target_market,
                user_id: user.id
            };

            // same enqueue path as the dispatcher
            await businessIdeaQueue.add('processBusinessIdea', payload, { jobId: `test-comp-${idea.id}` });
            await businessIdeaQueue.add('processMarketAnalysis', payload, { jobId: `test-market-${idea.id}` });

            startBusinessIdeaWorker();

            // no API keys — fallback paths only
            const ready = await waitFor(async () => {
                const competitors = await countRows('competitors');
                const market = await countRows('market_analysis');
                return competitors >= 1 && market >= 1;
            });

            assert.ok(ready, 'worker did not persist analysis rows within the timeout');

            const competitor = await adminQuery(
                'SELECT name, source FROM competitors WHERE business_id = $1',
                [idea.id]
            );
            assert.equal(competitor.rows.length, 1);
            assert.equal(competitor.rows[0].name, 'None');

            const market = await adminQuery(
                'SELECT business_id FROM market_analysis WHERE business_id = $1',
                [idea.id]
            );
            assert.equal(market.rows.length, 1);
        });
    });
});
