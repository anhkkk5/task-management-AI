import Redis from "ioredis";

let redisClient: Redis | null = null;

const toBool = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true";
};

export const getRedis = (): Redis => {
  if (redisClient) return redisClient;

  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined;
  const username = process.env.REDIS_USERNAME;
  const password = process.env.REDIS_PASSWORD;
  const tlsEnabled = toBool(process.env.REDIS_TLS, false);

  if (!host || !port) {
    throw new Error("Missing env REDIS_HOST/REDIS_PORT");
  }

  redisClient = new Redis({
    host,
    port,
    username,
    password,
    ...(tlsEnabled ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  });

  return redisClient;
};
