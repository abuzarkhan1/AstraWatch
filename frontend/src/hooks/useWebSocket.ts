import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || '';

class WebSocketManager {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  connect(token?: string): Socket {
    if (this.socket?.connected) return this.socket;

    let authToken = token;
    if (!authToken && typeof document !== 'undefined') {
      const tokenMatch = document.cookie.match(/(?:^|; )accessToken=([^;]*)/);
      if (tokenMatch) {
        authToken = decodeURIComponent(tokenMatch[1]);
      }
    }

    this.socket = io(WS_URL, {
      path: '/ws',
      auth: authToken ? { token: authToken } : undefined,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket?.id);
      this.socket?.emit('dashboard:subscribe', {});
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err.message);
    });

    this.socket.on('*', (event: string, data: unknown) => {
      const handlers = this.listeners.get(event);
      handlers?.forEach((handler) => handler(data));
    });

    return this.socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    this.socket?.on(event, handler);

    return () => {
      this.listeners.get(event)?.delete(handler);
      this.socket?.off(event, handler);
    };
  }

  emit(event: string, data: unknown): void {
    this.socket?.emit(event, data);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const wsManager = new WebSocketManager();
export default wsManager;
