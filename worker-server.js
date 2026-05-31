import { startBusinessIdeaWorker } from './queue/worker.js';
import db from './config/db.js';

startBusinessIdeaWorker();
console.log('Worker service is running.');

const shutdown = async () => {
    try {
        await db.end();
    } finally {
        process.exit(0);
    }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);