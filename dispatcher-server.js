import { startOutboxDispatcher } from './queue/outbox-dispatcher.js';
import { ensureOutboxTable } from './queue/outbox.js';
import db from './config/db.js';

const bootstrap = async () => {
    try {
        await ensureOutboxTable();
        await startOutboxDispatcher();

        console.log('Dispatcher service is running.');
    } catch (error) {
        console.error('Failed to bootstrap outbox dispatcher:', error.message);
        process.exit(1);
    }
};

const shutdown = async () => {
    try {
        await db.end();
    } finally {
        process.exit(0);
    }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bootstrap();