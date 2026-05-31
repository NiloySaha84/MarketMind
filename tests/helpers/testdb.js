// Test harness DB helpers.
//
// These connect as the Postgres SUPERUSER (bia_user) so the suite can reset
// tables and seed users while BYPASSING row-level security. The application
// code under test keeps using the normal `bia_app` pool from config/db.js, so
// RLS is still exercised by the actual request handlers.

import '../../config/env.js'; // side effect: load .env.test.local into process.env
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const {
    DB_HOST,
    DB_PORT,
    DB_NAME,
    PG_ADMIN_USER = 'bia_user',
    PG_ADMIN_PASSWORD = 'bia_password',
    JWT_SECRET
} = process.env;

const admin = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: PG_ADMIN_USER,
    password: PG_ADMIN_PASSWORD,
    max: 4
});

// Every application table, ordered so a single TRUNCATE ... CASCADE is enough.
const APP_TABLES = [
    'report',
    'competitors',
    'market_analysis',
    'business_idea',
    'users',
    'outbox_jobs',
    'dead_letter_jobs'
];

export const adminQuery = (text, params) => admin.query(text, params);

/** Wipe all data and reset identity sequences so IDs are deterministic. */
export const resetDatabase = async () => {
    await admin.query(`TRUNCATE ${APP_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
};

/** Insert a user directly (bypassing RLS) and return the row. */
export const seedUser = async ({
    name = 'Test User',
    email = 'test@example.com',
    password = 'password123'
} = {}) => {
    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await admin.query(
        'INSERT INTO users (name, email, hashed_pass) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
        [name, email, hashed]
    );
    return { ...rows[0], password };
};

/** Insert a business idea directly for a given user. */
export const seedBusinessIdea = async ({ userId, idea = 'A test idea', targetMarket = 'Testers' }) => {
    const { rows } = await admin.query(
        'INSERT INTO business_idea (idea_des, target_market, user_id) VALUES ($1, $2, $3) RETURNING *',
        [idea, targetMarket, userId]
    );
    return rows[0];
};

/** Sign a JWT exactly like the auth controller does, for authenticated requests. */
export const signToken = (userId) => jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1d' });

/** Convenience: number of rows in a table (admin / no RLS). */
export const countRows = async (table) => {
    const { rows } = await admin.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    return rows[0].n;
};

export const closeAdmin = () => admin.end();
