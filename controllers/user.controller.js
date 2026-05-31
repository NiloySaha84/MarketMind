import db from '../config/db.js';
import { setRLSUser } from '../lib/dbSession.js';

export const getUsers = async (req, res, next) => {
    let client;
    let inTransaction = false;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        inTransaction = true;
        await setRLSUser(client, req.user.id);
        const users = await client.query('SELECT id, name, email, created_at FROM users WHERE id = $1', [req.user.id]);
        await client.query('COMMIT');
        inTransaction = false;

        res.status(200).json({
            success: true,
            data: users.rows
        });
    } catch (error) {
        if (client && inTransaction) {
            await client.query('ROLLBACK');
        }
        next(error);
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const getUserById = async (req, res, next) => {
    let client;
    let inTransaction = false;
    try {
        const { id } = req.params;
        const userId = Number(id);

        if (!Number.isInteger(userId) || userId !== req.user.id) {
            const error = new Error('Forbidden');
            error.statusCode = 403;
            throw error;
        }

        client = await db.connect();
        await client.query('BEGIN');
        inTransaction = true;
        await setRLSUser(client, req.user.id);
        const user = await client.query('SELECT id, name, email, created_at FROM users WHERE id = $1', [userId]);

        if (user.rows.length === 0) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        await client.query('COMMIT');
        inTransaction = false;

        res.status(200).json({
            success: true,
            data: user.rows[0]
        });
    } catch (error) {
        if (client && inTransaction) {
            await client.query('ROLLBACK');
        }
        next(error);
    } finally {
        if (client) {
            client.release();
        }
    }
};
