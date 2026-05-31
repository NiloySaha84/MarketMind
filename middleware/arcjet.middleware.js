import aj from '../config/arcjet.js';

// True for loopback / private / link-local addresses that Arcjet cannot
// fingerprint when running in production mode (e.g. local testing, requests
// that never passed through a public-facing proxy).
const isLocalOrPrivateIp = (ip) => {
    if (!ip) return true;

    // Normalise IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1).
    const addr = ip.replace(/^::ffff:/i, '');

    return (
        addr === '::1' ||
        addr === '127.0.0.1' ||
        addr.startsWith('10.') ||
        addr.startsWith('192.168.') ||
        addr.startsWith('169.254.') ||
        addr.startsWith('fc') ||
        addr.startsWith('fd') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(addr) ||
        /^127\./.test(addr)
    );
};

const arcjetMiddleware = async (req, res, next) => {
    try {
        // Requests without a public client IP (local development, direct
        // localhost calls) can't be fingerprinted by Arcjet in production
        // mode, which errors on every request. There's nothing to rate limit
        // for a local/private address, so skip protection. Real traffic behind
        // a proxy carries a public IP in X-Forwarded-For and is unaffected.
        if (isLocalOrPrivateIp(req.ip)) {
            return next();
        }

        const decision = await aj.protect(req, { requested: 1 });

        // Fail open: if Arcjet can't evaluate the request (e.g. no public IP to
        // fingerprint when running locally/behind a proxy), log and continue
        // instead of blocking legitimate traffic.
        if (decision.isErrored()) {
            console.warn("Arcjet decision errored:", decision.reason?.message);
            return next();
        }

        if (decision.isDenied()) {
            if (decision.reason.isRateLimit()) {
                return res.status(429).json({
                    error: "Too Many Requests"
                });
            }

            if (decision.reason.isBot()) {
                return res.status(403).json({
                    error: "No bots allowed"
                });
            }

            return res.status(403).json({
                error: "Forbidden"
            });
        }

        next();
    } catch (error) {
        console.log("Arcjet error", error);
        next();
    }
};

export default arcjetMiddleware;
