// API integration tests — real Express app against a real Postgres test DB.
//
// Exercises the auth and business-idea HTTP endpoints through supertest,
// including the success and error paths and the Postgres-error -> HTTP-status
// mapping in the error middleware. Requires the test stack to be up:
//
//   docker compose -f tests/docker-compose.test.yml up -d
//
// Run with: npm run test:integration

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../../app.js';
import db from '../../config/db.js';
import redis from '../../config/redis.js';
import businessIdeaQueue from '../../queue/server.js';
import { resetDatabase, countRows, closeAdmin } from '../helpers/testdb.js';

const signup = (body) => request(app).post('/api/v1/auth/signup').send(body);
const login = (body) => request(app).post('/api/v1/auth/login').send(body);

const validUser = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'sup3rsecret' };

describe('API integration', () => {
    before(async () => {
        await businessIdeaQueue.obliterate({ force: true }).catch(() => {});
    });

    beforeEach(async () => {
        await resetDatabase();
        await redis.flushdb().catch(() => {});
    });

    after(async () => {
        await businessIdeaQueue.obliterate({ force: true }).catch(() => {});
        await businessIdeaQueue.close();
        await redis.quit();
        await db.end();
        await closeAdmin();
    });

    describe('POST /auth/signup', () => {
        test('creates a user and returns a token (no password hash leaked)', async () => {
            const res = await signup(validUser);
            assert.equal(res.status, 201);
            assert.equal(res.body.success, true);
            assert.ok(res.body.data.token, 'expected a JWT');
            assert.equal(res.body.data.user.email, validUser.email);
            assert.equal(res.body.data.user.name, validUser.name);
            assert.equal(res.body.data.user.hashed_pass, undefined, 'must not leak hashed_pass');
            assert.equal(await countRows('users'), 1);
        });

        test('rejects a duplicate email with 409', async () => {
            await signup(validUser);
            const res = await signup(validUser);
            assert.equal(res.status, 409);
            assert.equal(res.body.success, false);
        });

        test('rejects an invalid email format with 400', async () => {
            const res = await signup({ ...validUser, email: 'not-an-email' });
            assert.equal(res.status, 400);
            assert.match(res.body.error, /invalid email/i);
        });
    });

    describe('POST /auth/login', () => {
        beforeEach(async () => {
            await signup(validUser);
        });

        test('logs in with correct credentials', async () => {
            const res = await login({ email: validUser.email, password: validUser.password });
            assert.equal(res.status, 200);
            assert.ok(res.body.data.token);
            assert.equal(res.body.data.user.email, validUser.email);
        });

        test('rejects a wrong password with 401', async () => {
            const res = await login({ email: validUser.email, password: 'wrong' });
            assert.equal(res.status, 401);
        });

        test('returns 404 for an unknown user', async () => {
            const res = await login({ email: 'nobody@example.com', password: 'whatever' });
            assert.equal(res.status, 404);
        });
    });

    describe('business ideas (authenticated)', () => {
        let token;

        beforeEach(async () => {
            const res = await signup(validUser);
            token = res.body.data.token;
        });

        const auth = (req) => req.set('Authorization', `Bearer ${token}`);

        test('creates a business idea and writes two outbox jobs', async () => {
            const res = await auth(
                request(app)
                    .post('/api/v1/business-ideas')
                    .send({ idea: 'AI tutor for kids', target_market: 'Parents' })
            );

            assert.equal(res.status, 201);
            assert.ok(res.body.data.business_idea_id);
            assert.ok(res.body.data.outbox_jobs.competitors);
            assert.ok(res.body.data.outbox_jobs.market_analysis);
            // The transactional outbox row count is independent of whether the
            // immediate BullMQ dispatch succeeded.
            assert.equal(await countRows('outbox_jobs'), 2);
            assert.equal(await countRows('business_idea'), 1);
        });

        test('lists the current user\'s ideas', async () => {
            await auth(
                request(app)
                    .post('/api/v1/business-ideas')
                    .send({ idea: 'Idea one', target_market: 'Market one' })
            );

            const res = await auth(request(app).get('/api/v1/business-ideas'));
            assert.equal(res.status, 200);
            assert.equal(res.body.data.business_ideas.length, 1);
            assert.equal(res.body.data.business_ideas[0].idea_des, 'Idea one');
        });

        test('fetches a single idea by id', async () => {
            const created = await auth(
                request(app)
                    .post('/api/v1/business-ideas')
                    .send({ idea: 'Idea X', target_market: 'Market X' })
            );
            const id = created.body.data.business_idea_id;

            const res = await auth(request(app).get(`/api/v1/business-ideas/${id}`));
            assert.equal(res.status, 200);
            assert.equal(res.body.data.id, id);
            assert.equal(res.body.data.idea_des, 'Idea X');
            assert.deepEqual(res.body.data.competitors, []);
            assert.deepEqual(res.body.data.market_analysis, []);
        });

        test('rejects an invalid id with 400', async () => {
            const res = await auth(request(app).get('/api/v1/business-ideas/not-a-number'));
            assert.equal(res.status, 400);
        });

        test('returns 404 for a non-existent idea', async () => {
            const res = await auth(request(app).get('/api/v1/business-ideas/999999'));
            assert.equal(res.status, 404);
        });
    });

    describe('GET /users', () => {
        test('returns only the authenticated user', async () => {
            const res = await signup(validUser);
            const token = res.body.data.token;
            const userId = res.body.data.user.id;

            const usersRes = await request(app)
                .get('/api/v1/users')
                .set('Authorization', `Bearer ${token}`);

            assert.equal(usersRes.status, 200);
            assert.equal(usersRes.body.data.length, 1);
            assert.equal(usersRes.body.data[0].id, userId);
        });
    });
});
