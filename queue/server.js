import { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } from '../config/env.js';
import { Queue } from 'bullmq';

const businessIdeaQueue = new Queue('businessIdeaQueue', {
    connection: {
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD,
        db: 0
    }
});

export default businessIdeaQueue;