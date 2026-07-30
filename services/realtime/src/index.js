import { Server } from 'socket.io';
import Redis from 'ioredis';
import winston from 'winston';

import config from './config.js';
import KafkaConsumer from './kafka/consumer.js';
import socketAuth from './auth/socketAuth.js';
import { createRedisAdapter } from './redis/adapter.js';
import { setupDashboardSocket } from './sockets/dashboard.socket.js';
import { setupIncidentSocket } from './sockets/incidents.socket.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

class RealtimeGateway {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      path: config.SOCKET_PATH,
      cors: {
        origin: config.CORS_ORIGIN,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingInterval: config.HEARTBEAT_INTERVAL,
      pingTimeout: 5000,
    });

    this.kafkaConsumer = new KafkaConsumer();
    this.eventCache = new Map();
    this.eventCacheTimestamps = new Map();
    this.clientSubscriptions = new Map();
    this.setup();
  }

  async setup() {
    await this.setupRedisAdapter();
    this.setupAuth();
    this.setupEventHandlers();
    await this.setupKafkaBridge();
    this.setupMetrics();
    logger.info('Realtime gateway initialized');
  }

  async setupRedisAdapter() {
    try {
      const pubClient = new Redis(config.REDIS_URL);
      const subClient = pubClient.duplicate();

      this.io.adapter(createRedisAdapter(pubClient, subClient).adapter);
      logger.info('Redis adapter configured for Socket.io');
    } catch (err) {
      logger.warn('Redis adapter not available, using in-memory only', err.message);
    }
  }

  setupAuth() {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const result = socketAuth.validateToken(token);
      if (!result.valid) {
        const apiResult = socketAuth.validateApiKey(token);
        if (!apiResult.valid) {
          return next(new Error(result.error));
        }
        socket.user = { type: 'api_key', ...apiResult };
      } else {
        socket.user = result;
      }

      next();
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}, userId: ${socket.user?.userId || 'api'}`);

      socket.emit('connected', {
        socketId: socket.id,
        serverTime: new Date().toISOString(),
      });

      // ── JWT revalidation timer (every 10 min) ───────────────────────
      const revalidationTimer = setInterval(() => {
        if (!socket.user?.token) return;

        const result = socketAuth.validateToken(socket.user.token);
        if (!result.valid) {
          logger.warn(`Token revalidation failed for socket ${socket.id}: ${result.error}`);
          socket.emit('auth:renew', { error: result.error, disconnected: false });
        } else {
          socket.user = result;
        }
      }, config.JWT_REVALIDATION_INTERVAL_MS);

      socket.on('auth:refresh', ({ token }) => {
        const result = socketAuth.validateToken(token);
        if (result.valid) {
          socket.user = result;
          socket.emit('auth:renewed', { success: true });
        } else {
          socket.emit('auth:renewed', { success: false, error: result.error });
        }
      });

      // ── Dashboard socket handlers ────────────────────────────────────
      setupDashboardSocket(socket, this.io);

      // ── Incident socket handlers ─────────────────────────────────────
      setupIncidentSocket(socket, this.io);

      // ── Service subscription ────────────────────────────────────────
      socket.on('service:subscribe', ({ serviceId }) => {
        if (serviceId) {
          socket.join(`service:${serviceId}`);
          this.trackSubscription(socket.id, `service:${serviceId}`);
        }
      });

      // ── Replay handler ──────────────────────────────────────────────
      socket.on('replay', ({ eventTypes, since, room }) => {
        const replayTarget = room || 'dashboard:all';
        const sinceTime = since ? new Date(since).getTime() : (Date.now() - 60000);

        let replayed = 0;
        for (const [cacheKey, value] of this.eventCache.entries()) {
          const eventTime = this.eventCacheTimestamps.get(cacheKey) || 0;
          if (eventTime < sinceTime) continue;

          const colonIdx = cacheKey.indexOf(':');
          const eventType = colonIdx > 0 ? cacheKey.substring(0, colonIdx) : cacheKey;

          if (eventTypes && !eventTypes.includes(eventType)) continue;

          if (socket.rooms.has(replayTarget) || replayTarget === 'dashboard:all') {
            socket.emit(eventType, value);
            replayed++;
          }
        }

        socket.emit('replay:complete', { replayed, since: new Date(sinceTime).toISOString() });
        logger.debug(`Replayed ${replayed} events to socket ${socket.id}`);
      });

      // ── Disconnect ──────────────────────────────────────────────────
      socket.on('disconnect', (reason) => {
        clearInterval(revalidationTimer);
        logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
        this.clientSubscriptions.delete(socket.id);
      });

      socket.on('error', (err) => {
        logger.error(`Socket error ${socket.id}:`, err.message);
      });
    });
  }

  async setupKafkaBridge() {
    await this.kafkaConsumer.connect();

    this.kafkaConsumer.on('*', ({ eventType, key, value, topic }) => {
      if (this.isDuplicate(eventType, key)) return;

      this.cacheEvent(eventType, key, value);

      this.io.to('dashboard:all').emit(eventType, {
        ...value,
        _meta: { key, topic, timestamp: new Date().toISOString() },
      });

      if (value.serviceId) {
        this.io.to(`service:${value.serviceId}`).emit(eventType, value);
      }

      if (value.incidentId) {
        this.io.to(`incident:${value.incidentId}`).emit(eventType, value);
      }
    });
  }

  cacheEvent(eventType, key, value) {
    const cacheKey = `${eventType}:${key}`;
    const now = Date.now();

    this.eventCache.set(cacheKey, value);
    this.eventCacheTimestamps.set(cacheKey, now);

    if (this.eventCache.size > config.EVENT_CACHE_MAX) {
      const oldest = this.eventCache.entries().next().value;
      if (oldest) {
        this.eventCache.delete(oldest[0]);
        this.eventCacheTimestamps.delete(oldest[0]);
      }
    }
  }

  isDuplicate(eventType, key) {
    if (!key || key === 'undefined') return false;

    const cacheKey = `${eventType}:${key}`;
    const now = Date.now();

    if (this.eventCache.has(cacheKey)) {
      const lastSeen = this.eventCacheTimestamps.get(cacheKey) || 0;
      if (now - lastSeen < config.EVENT_DEDUP_WINDOW_MS) {
        return true;
      }
    }

    this.eventCache.set(cacheKey, { _dedup: true });
    this.eventCacheTimestamps.set(cacheKey, now);
    return false;
  }

  trackSubscription(socketId, room) {
    if (!this.clientSubscriptions.has(socketId)) {
      this.clientSubscriptions.set(socketId, new Set());
    }
    this.clientSubscriptions.get(socketId).add(room);
  }

  setupMetrics() {
    setInterval(() => {
      const stats = {
        connectedClients: this.io.engine?.clientsCount || 0,
        rooms: this.io.sockets?.adapter?.rooms?.size || 0,
        subscriptions: this.clientSubscriptions.size,
        eventCacheSize: this.eventCache.size,
      };
      logger.debug('Gateway metrics', stats);
    }, 30000);
  }

  async shutdown() {
    logger.info('Shutting down realtime gateway');
    await this.kafkaConsumer.disconnect();
    this.io.close();
  }
}

export default RealtimeGateway;
