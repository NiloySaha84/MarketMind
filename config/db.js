import { Pool } from 'pg';
import { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } from './env.js';

const db = new Pool({
    user: DB_USER,
    host: DB_HOST,
    database: DB_NAME,
    password: DB_PASSWORD,
    port: DB_PORT,
    max: 20, // max connections
    //idleTimeoutMillis: 30000,
    //connectionTimeoutMillis: 2000,
});

db.on('error', (err) => {
    console.error('PostgreSQL client error:', err.message);
});

export default db;