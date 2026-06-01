import aj from '../config/arcjet.js';

// localhost / private IPs — Arcjet can't fingerprint these in prod mode
const isLocalOrPrivateIp = (ip) => {
    if (!ip) return true;

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
        // skip local dev — nothing useful to rate limit on 127.0.0.1
        if (isLocalOrPrivateIp(req.ip)) {
            return next();
        }

        const decision = await aj.protect(req, { requested: 1 });

        // fail open — don't block traffic if Arcjet glitches
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
