import AgentAPI from 'apminsight';

// skip APM in tests — keeps the process from hanging
if (process.env.NODE_ENV !== 'test') {
    AgentAPI.config();
}

import express from 'express';
import logger from 'morgan';
import cookieParser from 'cookie-parser';
import { PORT, HOSTNAME } from './config/env.js';
import db from './config/db.js';
import authRouter from './routes/auth.routes.js';
import userRouter from './routes/user.routes.js';
import businessIdeaRouter from './routes/businessIdea.routes.js';
import errorMiddleware from './middleware/error.middleware.js';
import arcjetMiddleware from './middleware/arcjet.middleware.js';

const app = express();

// need real client IP for Arcjet (X-Forwarded-For behind nginx)
app.set('trust proxy', true);

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(arcjetMiddleware);

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/business-ideas', businessIdeaRouter);

app.use(errorMiddleware);

app.get('/', (req, res) => {
    res.send('Hello World');
});

app.get('/api/v1/db-test', async (req, res) => {
    try {

        const result = await db.query("SELECT NOW() AS now");
    
        res.json({ ok: true, time: result.rows[0].now });
    
      } catch (error) {
    
        console.error(error);
    
        res.status(500).json({ ok: false, error: "DB connection failed" });
    
      }
});

export const startApiServer = () => {
    const server = app.listen(PORT, HOSTNAME, () => {
        console.log(`API service is running on http://${HOSTNAME}:${PORT}`);
    });

    const shutdown = async () => {
        server.close(async () => {
            try {
                await db.end();
            } finally {
                process.exit(0);
            }
        });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
};

const isMainModule = process.argv[1]?.endsWith('app.js');

if (isMainModule) {
    startApiServer();
}

export default app;
