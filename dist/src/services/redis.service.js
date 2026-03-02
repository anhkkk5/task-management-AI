"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisConfig = exports.getRedis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
let redisClient = null;
const toBool = (value, defaultValue) => {
    if (value === undefined)
        return defaultValue;
    return value.toLowerCase() === "true";
};
const getRedisOptions = () => {
    const host = process.env.REDIS_HOST;
    const port = process.env.REDIS_PORT
        ? Number(process.env.REDIS_PORT)
        : undefined;
    const username = process.env.REDIS_USERNAME;
    const password = process.env.REDIS_PASSWORD;
    const tlsEnabled = toBool(process.env.REDIS_TLS, false);
    if (!host || !port) {
        throw new Error("Missing env REDIS_HOST/REDIS_PORT");
    }
    return {
        host,
        port,
        username,
        password,
        ...(tlsEnabled ? { tls: {} } : {}),
        maxRetriesPerRequest: null,
    };
};
const getRedis = () => {
    if (redisClient)
        return redisClient;
    redisClient = new ioredis_1.default(getRedisOptions());
    return redisClient;
};
exports.getRedis = getRedis;
// Export config for BullMQ (needs plain object, not Redis instance)
const getRedisConfig = () => {
    return getRedisOptions();
};
exports.getRedisConfig = getRedisConfig;
