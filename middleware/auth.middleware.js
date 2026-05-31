import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import db from '../config/db.js';
import { setRLSUser } from '../lib/dbSession.js';

const authorize = async (req, res, next) => {
    let client;
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (!token) {
            const error = new Error("Unauthorized");
            error.statusCode = 401;
            throw error;
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        client = await db.connect();
        await client.query('BEGIN');
        await setRLSUser(client, decoded.id);
        const user = await client.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        await client.query('COMMIT');

        if (user.rows.length === 0) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        req.user = user.rows[0];
        next();
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK').catch(() => {});
        }
        res.status(401).json({
            success: false,
            message: "Unauthorized"
        });
    } finally {
        if (client) {
            client.release();
        }
    }
};

export default authorize;
