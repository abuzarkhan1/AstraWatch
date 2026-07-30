export default {
  KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'localhost:9092',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
  PORT: parseInt(process.env.PORT || '3001', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  SOCKET_PATH: process.env.SOCKET_PATH || '/ws',
  EVENT_DEDUP_WINDOW_MS: parseInt(process.env.EVENT_DEDUP_WINDOW_MS || '10000', 10),
  HEARTBEAT_INTERVAL: parseInt(process.env.HEARTBEAT_INTERVAL || '25000', 10),
  JWT_REVALIDATION_INTERVAL_MS: parseInt(process.env.JWT_REVALIDATION_INTERVAL_MS || '600000', 10),
  EVENT_CACHE_MAX: parseInt(process.env.EVENT_CACHE_MAX || '5000', 10),
  EVENT_CACHE_TTL_MS: parseInt(process.env.EVENT_CACHE_TTL_MS || '3600000', 10),
};
