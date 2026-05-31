// Core unit tests for MarketMind.
//
// These cover the most important pieces of business/infra logic that can run
// without a live Postgres, Redis, or any external API:
//   - lib/resilience.js     (retry + circuit breaker that guard OpenAI/Tavily)
//   - middleware/error.middleware.js (maps DB/HTTP errors -> status codes)
//   - lib/dbSession.js      (row-level-security session helpers)
//   - queue/deadLetter.js   (exhausted-job detection)
//
// Run with: `npm test` (uses Node's built-in test runner, no extra deps).

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    isRetryableError,
    retryWithBackoff,
    CircuitBreaker
} from '../../lib/resilience.js';
import errorMiddleware from '../../middleware/error.middleware.js';
import { setRLSUser, setLoginEmail } from '../../lib/dbSession.js';
import { isExhausted } from '../../queue/deadLetter.js';

// --- Minimal Express res mock --------------------------------------------
// errorMiddleware only needs status()/json() and a headersSent flag.
const makeRes = () => {
    const res = {
        statusCode: undefined,
        body: undefined,
        headersSent: false,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
    return res;
};

describe('lib/resilience - isRetryableError', () => {
    test('retries on transient HTTP status codes', () => {
        assert.equal(isRetryableError({ status: 429 }), true);
        assert.equal(isRetryableError({ status: 503 }), true);
        assert.equal(isRetryableError({ statusCode: 500 }), true);
        assert.equal(isRetryableError({ response: { status: 502 } }), true);
    });

    test('does NOT retry on client errors', () => {
        assert.equal(isRetryableError({ status: 400 }), false);
        assert.equal(isRetryableError({ status: 401 }), false);
        assert.equal(isRetryableError({ status: 404 }), false);
    });

    test('retries on transient network error codes', () => {
        assert.equal(isRetryableError({ code: 'ECONNRESET' }), true);
        assert.equal(isRetryableError({ code: 'ETIMEDOUT' }), true);
        assert.equal(isRetryableError({ cause: { code: 'EAI_AGAIN' } }), true);
    });

    test('never retries a tripped circuit breaker or empty error', () => {
        assert.equal(isRetryableError({ circuitOpen: true, status: 503 }), false);
        assert.equal(isRetryableError(null), false);
        assert.equal(isRetryableError({}), false);
    });
});

describe('lib/resilience - retryWithBackoff', () => {
    test('returns immediately when the call succeeds', async () => {
        let calls = 0;
        const result = await retryWithBackoff(async () => {
            calls += 1;
            return 'ok';
        });
        assert.equal(result, 'ok');
        assert.equal(calls, 1);
    });

    test('retries transient failures then succeeds', async () => {
        let calls = 0;
        const result = await retryWithBackoff(
            async () => {
                calls += 1;
                if (calls < 3) {
                    const err = new Error('temporary');
                    err.status = 503;
                    throw err;
                }
                return 'recovered';
            },
            { baseDelayMs: 1, retries: 5 }
        );
        assert.equal(result, 'recovered');
        assert.equal(calls, 3);
    });

    test('does not retry non-retryable errors', async () => {
        let calls = 0;
        await assert.rejects(
            retryWithBackoff(
                async () => {
                    calls += 1;
                    const err = new Error('bad request');
                    err.status = 400;
                    throw err;
                },
                { baseDelayMs: 1 }
            ),
            /bad request/
        );
        assert.equal(calls, 1);
    });

    test('gives up after exhausting all retries', async () => {
        let calls = 0;
        await assert.rejects(
            retryWithBackoff(
                async () => {
                    calls += 1;
                    const err = new Error('still down');
                    err.status = 500;
                    throw err;
                },
                { baseDelayMs: 1, retries: 2 }
            ),
            /still down/
        );
        // 1 initial attempt + 2 retries
        assert.equal(calls, 3);
    });
});

describe('lib/resilience - CircuitBreaker', () => {
    test('opens after hitting the failure threshold and fails fast', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });
        const boom = async () => {
            throw new Error('dependency down');
        };

        await assert.rejects(breaker.exec(boom));
        assert.equal(breaker.state, 'CLOSED');
        await assert.rejects(breaker.exec(boom));
        assert.equal(breaker.state, 'OPEN');

        // While OPEN, the breaker rejects without invoking the function.
        let invoked = false;
        await assert.rejects(
            breaker.exec(async () => {
                invoked = true;
            }),
            (err) => err.circuitOpen === true
        );
        assert.equal(invoked, false);
    });

    test('half-opens after cooldown and closes on a successful probe', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 20 });
        await assert.rejects(
            breaker.exec(async () => {
                throw new Error('fail');
            })
        );
        assert.equal(breaker.state, 'OPEN');

        await new Promise((resolve) => setTimeout(resolve, 25));

        const result = await breaker.exec(async () => 'healthy');
        assert.equal(result, 'healthy');
        assert.equal(breaker.state, 'CLOSED');
        assert.equal(breaker.failures, 0);
    });

    test('a successful call resets the failure counter', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 50 });
        await assert.rejects(
            breaker.exec(async () => {
                throw new Error('one');
            })
        );
        assert.equal(breaker.failures, 1);

        await breaker.exec(async () => 'ok');
        assert.equal(breaker.failures, 0);
        assert.equal(breaker.state, 'CLOSED');
    });
});

describe('middleware/error.middleware - DB/HTTP error mapping', () => {
    test('maps Postgres unique violation (23505) to 409', () => {
        const res = makeRes();
        errorMiddleware({ code: '23505' }, {}, res, () => {});
        assert.equal(res.statusCode, 409);
        assert.equal(res.body.success, false);
        assert.match(res.body.error, /unique constraint/i);
    });

    test('maps email format check violation to 400 with a clear message', () => {
        const res = makeRes();
        errorMiddleware(
            { code: '23514', constraint: 'email_format_check' },
            {},
            res,
            () => {}
        );
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, 'Invalid email format');
    });

    test('maps NOT NULL violation (23502) to 400', () => {
        const res = makeRes();
        errorMiddleware({ code: '23502' }, {}, res, () => {});
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, 'Missing required field');
    });

    test('maps invalid JSON payload to 400', () => {
        const res = makeRes();
        errorMiddleware({ type: 'entity.parse.failed' }, {}, res, () => {});
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, 'Invalid JSON payload');
    });

    test('preserves an explicit statusCode and message', () => {
        const res = makeRes();
        const err = new Error('User already exists');
        err.statusCode = 409;
        errorMiddleware(err, {}, res, () => {});
        assert.equal(res.statusCode, 409);
        assert.equal(res.body.error, 'User already exists');
    });

    test('falls back to 500 for unknown errors', () => {
        const res = makeRes();
        errorMiddleware(new Error('something weird'), {}, res, () => {});
        assert.equal(res.statusCode, 500);
        assert.equal(res.body.error, 'something weird');
    });

    test('delegates to next() when headers were already sent', () => {
        const res = makeRes();
        res.headersSent = true;
        let nextCalled = false;
        let nextErr;
        errorMiddleware(new Error('late'), {}, res, (e) => {
            nextCalled = true;
            nextErr = e;
        });
        assert.equal(nextCalled, true);
        assert.equal(nextErr.message, 'late');
        assert.equal(res.statusCode, undefined);
    });
});

describe('lib/dbSession - RLS session helpers', () => {
    // Capture the SQL + params each helper sends to the pg client.
    let captured;
    const client = {
        query(text, params) {
            captured = { text, params };
            return Promise.resolve();
        }
    };

    beforeEach(() => {
        captured = undefined;
    });

    test('setRLSUser sets app.user_id as a transaction-local string', async () => {
        await setRLSUser(client, 42);
        assert.match(captured.text, /set_config\('app\.user_id', \$1, true\)/);
        assert.deepEqual(captured.params, ['42']);
    });

    test('setLoginEmail sets app.login_email with the given email', async () => {
        await setLoginEmail(client, 'a@b.com');
        assert.match(captured.text, /set_config\('app\.login_email', \$1, true\)/);
        assert.deepEqual(captured.params, ['a@b.com']);
    });
});

describe('queue/deadLetter - isExhausted', () => {
    test('false when no job is given', () => {
        assert.equal(isExhausted(null), false);
        assert.equal(isExhausted(undefined), false);
    });

    test('true only once attemptsMade reaches the configured max', () => {
        assert.equal(isExhausted({ attemptsMade: 1, opts: { attempts: 3 } }), false);
        assert.equal(isExhausted({ attemptsMade: 2, opts: { attempts: 3 } }), false);
        assert.equal(isExhausted({ attemptsMade: 3, opts: { attempts: 3 } }), true);
        assert.equal(isExhausted({ attemptsMade: 4, opts: { attempts: 3 } }), true);
    });

    test('defaults to a single attempt when opts.attempts is missing', () => {
        assert.equal(isExhausted({ attemptsMade: 0 }), false);
        assert.equal(isExhausted({ attemptsMade: 1 }), true);
    });
});
