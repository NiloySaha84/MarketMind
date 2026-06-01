import redis from './config/redis.js';

export async function getCache(key) {
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Failed to get cache:', error.message);
    return null;
  }
}

export async function setCache(key, data, ttlSeconds) {
  await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
}

export async function deleteCache(key) {
  await redis.del(key);
}
