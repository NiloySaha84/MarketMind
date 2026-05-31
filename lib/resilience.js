// Shared fault-tolerance helpers for external service calls (OpenAI, Tavily).
//
// Two building blocks:
//   1. retryWithBackoff - retries a call a few times on TRANSIENT errors only,
//      waiting longer between each attempt (exponential backoff + jitter).
//   2. CircuitBreaker   - after too many consecutive failures it stops calling
//      the dependency for a cooldown window, so we fail fast instead of piling
//      onto a service that is already down.

// HTTP status codes that are usually worth retrying (timeouts, rate limits,
// and transient server errors). 4xx like 400/401/404 are NOT retried.
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

// Low-level network error codes from Node / undici (fetch).
const RETRYABLE_CODES = new Set([
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ENOTFOUND',
    'EPIPE',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET'
]);

export const isRetryableError = (error) => {
    if (!error) return false;

    // A tripped circuit breaker is a "fail fast" signal, never retry it.
    if (error.circuitOpen) return false;

    const code = error.code || error.cause?.code;
    if (code && RETRYABLE_CODES.has(code)) return true;

    const status = error.status ?? error.statusCode ?? error.response?.status;
    if (typeof status === 'number') return RETRYABLE_STATUS.has(status);

    return false;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const retryWithBackoff = async (
    fn,
    {
        retries = 3,
        baseDelayMs = 500,
        maxDelayMs = 8000,
        label = 'operation',
        shouldRetry = isRetryableError
    } = {}
) => {
    let attempt = 0;

    // Total attempts = retries + 1 (the first try is not a "retry").
    while (true) {
        try {
            return await fn();
        } catch (error) {
            attempt += 1;
            if (attempt > retries || !shouldRetry(error)) {
                throw error;
            }

            const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
            const jitter = Math.floor(Math.random() * (backoff / 2));
            const delay = backoff + jitter;

            console.warn(
                `[retry] ${label} failed (attempt ${attempt}/${retries}); retrying in ${delay}ms: ${error.message}`
            );
            await sleep(delay);
        }
    }
};

// Simple three-state circuit breaker.
//   CLOSED    -> calls flow through normally.
//   OPEN      -> calls are rejected instantly for `cooldownMs`.
//   HALF_OPEN -> one probe call is allowed; success closes it, failure re-opens.
export class CircuitBreaker {
    constructor({ name = 'breaker', failureThreshold = 5, cooldownMs = 30000 } = {}) {
        this.name = name;
        this.failureThreshold = failureThreshold;
        this.cooldownMs = cooldownMs;
        this.failures = 0;
        this.state = 'CLOSED';
        this.openedAt = 0;
    }

    async exec(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.openedAt >= this.cooldownMs) {
                this.state = 'HALF_OPEN';
                console.warn(`[circuit:${this.name}] cooldown elapsed -> HALF_OPEN (probing)`);
            } else {
                const error = new Error(`Circuit "${this.name}" is open; skipping call`);
                error.circuitOpen = true;
                throw error;
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        if (this.state !== 'CLOSED') {
            console.log(`[circuit:${this.name}] success -> CLOSED`);
        }
        this.failures = 0;
        this.state = 'CLOSED';
    }

    onFailure() {
        this.failures += 1;
        if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.openedAt = Date.now();
            console.warn(
                `[circuit:${this.name}] OPEN for ${this.cooldownMs}ms after ${this.failures} failure(s)`
            );
        }
    }
}

// Shared breakers so every worker call to the same dependency trips together.
export const openAiBreaker = new CircuitBreaker({ name: 'openai', failureThreshold: 5, cooldownMs: 30000 });
export const tavilyBreaker = new CircuitBreaker({ name: 'tavily', failureThreshold: 5, cooldownMs: 30000 });

// Convenience wrapper: guard a call with the circuit breaker AND retry transient
// failures inside it. All retries together count as a single breaker attempt.
export const callWithResilience = (breaker, fn, options = {}) =>
    breaker.exec(() => retryWithBackoff(fn, options));
