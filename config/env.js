import { config } from 'dotenv';

config({path: `.env.${process.env.NODE_ENV || 'development'}.local`});

export const {
    PORT,
    HOSTNAME,
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    JWT_SECRET,
    JWT_COOKIE_EXPIRE,
    REDIS_HOST,
    REDIS_PORT,
    REDIS_PASSWORD,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    ARCJET_KEY,
    ARCJET_ENV,
    TAVILY_API_KEY
} = process.env;

// jsonwebtoken rejects undefined expiresIn; default keeps local/CI bootable.
export const JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
