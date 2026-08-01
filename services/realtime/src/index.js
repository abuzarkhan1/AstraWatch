import { Server } from 'socket.io';
import Redis from 'ioredis';
import pino from 'pino';
import { createTerminus } from '@godaddy/terminus';

import config from './config.js';
import KafkaConsumer from './kafka/consumer.js';
import socketAuth from './auth/socketAuth.js';
import { createRedisAdapter } from './redis/adapter.js';
import { setupDashboardSocket } from './sockets/dashboard.socket.js';
import { setupIncidentSocket } from './sockets/incidents.socket.js';

const logger = pino({
  level: 'info'
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
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        this.tokenFromCookie(socket.handshake.headers?.cookie);

      if (!token) {
        logger.warn('Authentication required. Handshake headers:', socket.handshake.headers);
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

  // The frontend stores the access token in an httpOnly cookie (XSRF-protected API
  // auth), so the socket handshake may carry it instead of an explicit auth token.
  tokenFromCookie(cookieHeader) {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|; )accessToken=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}, userId: ${socket.user?.userId || 'api'}, tenantId: ${socket.user?.tenantId || 'default'}`);

      const tenantId = socket.user?.tenantId || 'default';
      const tenantDashboardRoom = `tenant:${tenantId}:dashboard`;
      socket.join(tenantDashboardRoom);
      this.trackSubscription(socket.id, tenantDashboardRoom);

      socket.emit('connected', {
        socketId: socket.id,
        tenantId,
        serverTime: new Date().toISOString(),
      });

      // ── Per-socket message rate limiting ────────────────────────────
      const rateLimitWindowMs = 60000;
      const maxEventsPerMin = 120;
      let socketEventTimestamps = [];

      socket.use(([event, ...args], next) => {
        const now = Date.now();
        socketEventTimestamps = socketEventTimestamps.filter((ts) => now - ts < rateLimitWindowMs);
        if (socketEventTimestamps.length >= maxEventsPerMin) {
          logger.warn(`Rate limit exceeded for socket ${socket.id}, event: ${event}`);
          return next(new Error('Rate limit exceeded. Too many requests.'));
        }
        socketEventTimestamps.push(now);
        next();
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
          const room = `tenant:${tenantId}:service:${serviceId}`;
          socket.join(room);
          this.trackSubscription(socket.id, room);
        }
      });

      // ── Replay handler ──────────────────────────────────────────────
      socket.on('replay', ({ eventTypes, since, room }) => {
        const replayTarget = room ? (room.startsWith('tenant:') ? room : `tenant:${tenantId}:${room}`) : tenantDashboardRoom;
        const sinceTime = since ? new Date(since).getTime() : (Date.now() - 60000);

        let replayed = 0;
        for (const [cacheKey, value] of this.eventCache.entries()) {
          const eventTime = this.eventCacheTimestamps.get(cacheKey) || 0;
          if (eventTime < sinceTime) continue;

          // Tenant isolation check: cached event must belong to socket's tenant
          const eventTenant = value.tenantId || 'default';
          if (eventTenant !== tenantId) continue;

          const colonIdx = cacheKey.indexOf(':');
          const eventType = colonIdx > 0 ? cacheKey.substring(0, colonIdx) : cacheKey;

          if (eventTypes && !eventTypes.includes(eventType)) continue;

          if (socket.rooms.has(replayTarget) || socket.rooms.has(tenantDashboardRoom)) {
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

    this.kafkaConsumer.on('*', ({ eventType, key, value, topic, offset, timestamp }) => {
      const dedupKey = key || `${topic}-${offset}-${timestamp}`;
      if (this.isDuplicate(eventType, dedupKey)) return;

      this.cacheEvent(eventType, dedupKey, value);

      const tenantId = value.tenantId || 'default';

      // Broadcast ONLY to tenant-scoped rooms
      this.io.to(`tenant:${tenantId}:dashboard`).emit(eventType, {
        ...value,
        _meta: { key: dedupKey, topic, timestamp: new Date().toISOString() },
      });

      if (value.serviceId) {
        this.io.to(`tenant:${tenantId}:service:${value.serviceId}`).emit(eventType, value);
      }

      if (value.incidentId) {
        this.io.to(`tenant:${tenantId}:incident:${value.incidentId}`).emit(eventType, value);
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

import http from 'http';
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/v1/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'realtime', uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const gateway = new RealtimeGateway(server);
const PORT = process.env.PORT || 8084;

createTerminus(server, {
  signal: 'SIGINT',
  healthChecks: {
    '/healthcheck': async () => {
      return Promise.resolve();
    }
  },
  onSignal: async () => {
    logger.info('Server is starting cleanup');
    await gateway.shutdown();
  }
});

server.listen(PORT, () => {
  logger.info(`Realtime gateway listening on port ${PORT}`);
});

export default RealtimeGateway;
