import { startOutboxDispatcher, stopOutboxDispatcher } from './queue/outbox-dispatcher.js';
import { startBusinessIdeaWorker, stopBusinessIdeaWorker } from './queue/worker.js';
import db from './config/db.js';

const bootstrap = async () => {
    try {
        await startOutboxDispatcher();
        startBusinessIdeaWorker();
        console.log('Queue service is running (dispatcher + worker).');
    } catch (error) {
        console.error('Failed to bootstrap queue service:', error.message);
        process.exit(1);
    }
};

const shutdown = async () => {
    console.log('[queue-service] Shutting down...');
    try {
        stopOutboxDispatcher();
        await stopBusinessIdeaWorker();
        await db.end();
    } finally {
        process.exit(0);
    }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bootstrap();
