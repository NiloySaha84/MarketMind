// Load the Redis connection from the config folder
import redis from './config/redis.js';

// Read cached data for a given key; returns null on miss or Redis/parse errors
export async function getCache(key) {
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Failed to get cache:', error.message);
    return null;
  }
}

// Write data into the cache with an expiration time
export async function setCache(key, data, ttlSeconds) {
  // Save as JSON and set EX so the entry expires after ttlSeconds seconds
  await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
}

// Remove a single cached entry by key
export async function deleteCache(key) {
  // Delete that key from Redis
  await redis.del(key);
}
