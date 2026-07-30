import { createAdapter } from '@socket.io/redis-adapter';
import { EventEmitter } from 'events';

export function createRedisAdapter(pubClient, subClient) {
  const emitter = new EventEmitter();

  pubClient.on('error', (err) => {
    console.error('Redis pub client error:', err.message);
    emitter.emit('error', err);
  });

  subClient.on('error', (err) => {
    console.error('Redis sub client error:', err.message);
    emitter.emit('error', err);
  });

  pubClient.on('reconnecting', () => {
    console.warn('Redis pub client reconnecting...');
    emitter.emit('reconnecting');
  });

  subClient.on('reconnecting', () => {
    console.warn('Redis sub client reconnecting...');
    emitter.emit('reconnecting');
  });

  pubClient.on('connect', () => {
    console.log('Redis pub client connected');
    emitter.emit('connect');
  });

  subClient.on('connect', () => {
    console.log('Redis sub client connected');
    emitter.emit('connect');
  });

  const adapter = createAdapter(pubClient, subClient);

  return {
    adapter,
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
  };
}
