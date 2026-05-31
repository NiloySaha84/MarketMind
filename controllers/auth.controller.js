import {JWT_SECRET, JWT_EXPIRE, JWT_COOKIE_EXPIRE} from '../config/env.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import db from '../config/db.js';
import { setLoginEmail } from '../lib/dbSession.js';

const toPublicUser = ({ hashed_pass, ...user }) => user;

export const signup = async (req, res, next) => {
    let client;
    let inTransaction = false;
    try {
        client = await db.connect();
        await client.query("BEGIN");
        inTransaction = true;
        const {name, email, password} = req.body;

        await setLoginEmail(client, email);
        const existingUser = await client.query("SELECT * FROM users WHERE email = $1", [email]);
        if (existingUser.rows.length > 0) {
            const error = new Error("User already exists");
            error.statusCode = 409;
            throw error;
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await client.query("INSERT INTO users (name, email, hashed_pass) VALUES ($1, $2, $3) RETURNING *", [name, email, hashedPassword]);
        const user = newUser.rows[0]
        const token = jwt.sign({id: user.id}, JWT_SECRET, {expiresIn: JWT_EXPIRE});

        await client.query("COMMIT");
        inTransaction = false;

        res.status(201).json({
            success: true,
            data: { user: toPublicUser(user), token }
        });

    } catch (error) {
        if (client && inTransaction) {
            await client.query("ROLLBACK");
        }
        next(error);
    } finally {
        if (client) {
            client.release();
        }
    }

}

export const login = async (req, res, next) => {
    let client;
    let inTransaction = false;
    try {
        client = await db.connect();
        await client.query("BEGIN");
        inTransaction = true;
        const {email, password} = req.body;
        await setLoginEmail(client, email);
        const user = await client.query("SELECT * FROM users WHERE email = $1", [email]);
        if (user.rows.length === 0) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }
        const isPasswordValid = await bcrypt.compare(password, user.rows[0].hashed_pass);
        if (!isPasswordValid) {
            const error = new Error("Invalid password");
            error.statusCode = 401;
            throw error;
        }
        const token = jwt.sign({id: user.rows[0].id}, JWT_SECRET, {expiresIn: JWT_EXPIRE});
        await client.query("COMMIT");
        inTransaction = false;
        res.status(200).json({
            success: true,
            data: { user: toPublicUser(user.rows[0]), token }
        });
    } catch (error) {
        if (client && inTransaction) {
            await client.query("ROLLBACK");
        }
        next(error);
    } finally {
        if (client) {
            client.release();
        }
    }
};


