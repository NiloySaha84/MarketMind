// Auth + middleware request-flow tests.
//
// Focuses on the security-critical behaviour of the request pipeline:
//   - the authorize middleware (missing / malformed / valid tokens)
//   - the error middleware (malformed JSON -> 400)
//   - per-user isolation enforced by Postgres row-level security
//
// Run with: npm run test:integration

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../../app.js';
import db from '../../config/db.js';
import redis from '../../config/redis.js';
import businessIdeaQueue from '../../queue/server.js';
import { resetDatabase, signToken, closeAdmin } from '../helpers/testdb.js';

const signup = (body) => request(app).post('/api/v1/auth/signup').send(body);

const createIdea = (token, body) =>
    request(app).post('/api/v1/business-ideas').set('Authorization', `Bearer ${token}`).send(body);

describe('auth + middleware request flows', () => {
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

    describe('authorize middleware', () => {
        test('rejects a request with no token (401)', async () => {
            const res = await request(app).get('/api/v1/business-ideas');
            assert.equal(res.status, 401);
            assert.equal(res.body.success, false);
        });

        test('rejects a malformed/garbage token (401)', async () => {
            const res = await request(app)
                .get('/api/v1/business-ideas')
                .set('Authorization', 'Bearer not.a.real.jwt');
            assert.equal(res.status, 401);
        });

        test('rejects a token signed for a user that does not exist (401)', async () => {
            const res = await request(app)
                .get('/api/v1/business-ideas')
                .set('Authorization', `Bearer ${signToken(424242)}`);
            assert.equal(res.status, 401);
        });

        test('accepts a valid token (200)', async () => {
            const signed = await signup({ name: 'Val', email: 'val@example.com', password: 'password1' });
            const res = await request(app)
                .get('/api/v1/business-ideas')
                .set('Authorization', `Bearer ${signed.body.data.token}`);
            assert.equal(res.status, 200);
        });
    });

    describe('error middleware', () => {
        test('maps a malformed JSON body to 400', async () => {
            const res = await request(app)
                .post('/api/v1/auth/signup')
                .set('Content-Type', 'application/json')
                .send('{ "email": "broken" '); // intentionally invalid JSON
            assert.equal(res.status, 400);
            assert.match(res.body.error, /invalid json/i);
        });
    });

    describe('row-level-security isolation', () => {
        test('a user cannot read another user\'s business idea', async () => {
            const alice = await signup({ name: 'Alice', email: 'alice@example.com', password: 'password1' });
            const bob = await signup({ name: 'Bob', email: 'bob@example.com', password: 'password2' });

            const aliceToken = alice.body.data.token;
            const bobToken = bob.body.data.token;

            const created = await createIdea(aliceToken, { idea: 'Alice secret idea', target_market: 'X' });
            const aliceIdeaId = created.body.data.business_idea_id;

            // Bob tries to fetch Alice's idea directly -> RLS hides it -> 404.
            const bobFetch = await request(app)
                .get(`/api/v1/business-ideas/${aliceIdeaId}`)
                .set('Authorization', `Bearer ${bobToken}`);
            assert.equal(bobFetch.status, 404);

            // Bob's list must not contain Alice's idea.
            const bobList = await request(app)
                .get('/api/v1/business-ideas')
                .set('Authorization', `Bearer ${bobToken}`);
            assert.equal(bobList.status, 200);
            assert.equal(bobList.body.data.business_ideas.length, 0);

            // Alice can still see her own idea.
            const aliceFetch = await request(app)
                .get(`/api/v1/business-ideas/${aliceIdeaId}`)
                .set('Authorization', `Bearer ${aliceToken}`);
            assert.equal(aliceFetch.status, 200);
            assert.equal(aliceFetch.body.data.id, aliceIdeaId);
        });

        test('a user cannot fetch another user\'s record via /users/:id (403)', async () => {
            const alice = await signup({ name: 'Alice', email: 'alice@example.com', password: 'password1' });
            const bob = await signup({ name: 'Bob', email: 'bob@example.com', password: 'password2' });

            const otherId = bob.body.data.user.id;
            const res = await request(app)
                .get(`/api/v1/users/${otherId}`)
                .set('Authorization', `Bearer ${alice.body.data.token}`);

            assert.equal(res.status, 403);
        });
    });
});
