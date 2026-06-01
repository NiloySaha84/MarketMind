// retry + circuit breaker for OpenAI / Tavily calls

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

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

// CLOSED -> OPEN -> HALF_OPEN
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

export const openAiBreaker = new CircuitBreaker({ name: 'openai', failureThreshold: 5, cooldownMs: 30000 });
export const tavilyBreaker = new CircuitBreaker({ name: 'tavily', failureThreshold: 5, cooldownMs: 30000 });

export const callWithResilience = (breaker, fn, options = {}) =>
    breaker.exec(() => retryWithBackoff(fn, options));
