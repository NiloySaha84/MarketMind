// Single entrypoint for every Railway service that runs from the repo root.
// The process to launch is chosen by the SERVICE env var (defaults to "api"),
// which avoids relying on shell variable expansion inside Railway's startCommand.
// SERVICE_START_SCRIPT (e.g. "start:queue") is also accepted for convenience.
const raw =
    process.env.SERVICE ||
    (process.env.SERVICE_START_SCRIPT || '').replace(/^start:/, '') ||
    'api';

const service = raw.toLowerCase();

switch (service) {
    case 'queue':
        await import('./queue-service.js');
        break;
    case 'dispatcher':
        await import('./dispatcher-server.js');
        break;
    case 'worker':
        await import('./worker-server.js');
        break;
    case 'api':
    default: {
        const { startApiServer } = await import('./app.js');
        startApiServer();
        break;
    }
}
