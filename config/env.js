import { config } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';

config({ path: `.env.${process.env.NODE_ENV || 'development'}.local` });

/** env var, or /run/secrets/<name> in swarm */
function envOrSecret(key, secretFile) {
    const fromEnv = process.env[key];
    if (fromEnv !== undefined && fromEnv !== '') return fromEnv;

    const filePath = process.env[`${key}_FILE`] || `/run/secrets/${secretFile}`;
    if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf8').trim();
    }

    return process.env[key];
}

export const PORT = process.env.PORT;
export const HOSTNAME = process.env.HOSTNAME;
export const DB_HOST = process.env.DB_HOST;
export const DB_PORT = process.env.DB_PORT;
export const DB_USER = process.env.DB_USER;
export const DB_PASSWORD = envOrSecret('DB_PASSWORD', 'db_password');
export const DB_NAME = process.env.DB_NAME;
export const JWT_SECRET = envOrSecret('JWT_SECRET', 'jwt_secret');
export const JWT_COOKIE_EXPIRE = process.env.JWT_COOKIE_EXPIRE;
export const REDIS_HOST = process.env.REDIS_HOST;
export const REDIS_PORT = process.env.REDIS_PORT;
export const REDIS_PASSWORD = envOrSecret('REDIS_PASSWORD', 'redis_password');
export const OPENAI_API_KEY = envOrSecret('OPENAI_API_KEY', 'openai_api_key');
export const OPENAI_MODEL = process.env.OPENAI_MODEL;
export const ARCJET_KEY = envOrSecret('ARCJET_KEY', 'arcjet_key');
export const ARCJET_ENV = process.env.ARCJET_ENV;
export const TAVILY_API_KEY = envOrSecret('TAVILY_API_KEY', 'tavily_api_key');

// jwt needs a string here
export const JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
