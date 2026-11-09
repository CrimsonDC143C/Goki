import { resolveWsBaseUrl } from './apiClient';
import { getStoredAuthToken } from './tokenStorage';

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type WebSocketEventListener = (payload: any) => void;
export type WebSocketStatusListener = (status: WebSocketStatus) => void;

export interface InboundWebSocketEvent {
  type: string;
  room?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export class GokiWebSocketClient {
  private socket: WebSocket | null = null;
  private status: WebSocketStatus = 'disconnected';
  private subscribedRooms = new Set<string>();
  private eventListeners = new Map<string, Set<WebSocketEventListener>>();
  private statusListeners = new Set<WebSocketStatusListener>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private explicitDisconnect = false;
  private authToken: string | null = null;

  constructor() {
    this.status = 'disconnected';
  }

  /**
   * Returns current connection status.
   */
  public getStatus(): WebSocketStatus {
    return this.status;
  }

  /**
   * Returns dynamically resolved WebSocket base URL.
   */
  public getBaseUrl(): string {
    return resolveWsBaseUrl();
  }

  /**
   * Returns true if the WebSocket is currently open and active.
   */
  public isConnected(): boolean {
    return this.status === 'connected' && this.socket?.readyState === 1;
  }

  /**
   * Updates internal auth token and initiates/refreshes the connection.
   */
  public async setAuthToken(token: string | null): Promise<void> {
    this.authToken = token;
    if (this.isConnected() && token) {
      // Re-authenticate current open socket
      this.send({ type: 'AUTH', token });
    }
  }

  /**
   * Establishes real-time bi-directional connection to the Goki server.
   */
  public async connect(): Promise<void> {
    if (this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) {
      return;
    }

    this.explicitDisconnect = false;
    this.updateStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      const token = this.authToken ?? (await getStoredAuthToken());
      const wsBase = resolveWsBaseUrl();
      const url = token
        ? `${wsBase}/api/ws/connect?token=${encodeURIComponent(token)}`
        : `${wsBase}/api/ws/connect`;

      // Native React Native and Browser standard WebSocket
      const ws = new (globalThis.WebSocket as any)(url);
      this.socket = ws;

      ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        this.startHeartbeat();

        // Re-subscribe to all active rooms on reconnect
        for (const room of this.subscribedRooms) {
          this.send({ type: 'SUBSCRIBE', room });
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : String(event.data);
          const data: InboundWebSocketEvent = JSON.parse(raw);
          this.dispatch(data);
        } catch {
          // Ignore non-JSON frames
        }
      };

      ws.onclose = () => {
        this.stopHeartbeat();
        this.socket = null;
        if (!this.explicitDisconnect) {
          this.updateStatus('reconnecting');
          this.scheduleReconnect();
        } else {
          this.updateStatus('disconnected');
        }
      };

      ws.onerror = () => {
        // Error triggers onclose in standard WebSocket
      };
    } catch {
      this.updateStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  /**
   * Closes active connection and stops reconnection attempts.
   */
  public disconnect(): void {
    this.explicitDisconnect = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore close errors
      }
      this.socket = null;
    }
    this.updateStatus('disconnected');
  }

  /**
   * Subscribes to a real-time encounter room (e.g. `raid:ignisrax`, `dungeon:run_123`).
   */
  public subscribe(room: string): void {
    const trimmed = room.trim();
    if (!trimmed) return;

    this.subscribedRooms.add(trimmed);
    if (this.isConnected()) {
      this.send({ type: 'SUBSCRIBE', room: trimmed });
    }
  }

  /**
   * Unsubscribes from an encounter room.
   */
  public unsubscribe(room: string): void {
    const trimmed = room.trim();
    this.subscribedRooms.delete(trimmed);
    if (this.isConnected()) {
      this.send({ type: 'UNSUBSCRIBE', room: trimmed });
    }
  }

  /**
   * Sends a JSON message over the active socket.
   */
  public send(payload: Record<string, unknown>): boolean {
    if (!this.isConnected() || !this.socket) return false;
    try {
      this.socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Registers an event listener for a specific WebSocket message type.
   * Returns an unbind function.
   */
  public on(eventType: string, listener: WebSocketEventListener): () => void {
    let set = this.eventListeners.get(eventType);
    if (!set) {
      set = new Set();
      this.eventListeners.set(eventType, set);
    }
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.eventListeners.delete(eventType);
      }
    };
  }

  /**
   * Registers a connection status change listener.
   */
  public onStatusChange(listener: WebSocketStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private dispatch(event: InboundWebSocketEvent): void {
    // Specific event type listeners
    if (event.type) {
      const listeners = this.eventListeners.get(event.type);
      if (listeners) {
        for (const fn of listeners) {
          try {
            fn(event);
          } catch {
            // Protect dispatch loop
          }
        }
      }
    }

    // Wildcard listeners ('*')
    const wildcard = this.eventListeners.get('*');
    if (wildcard) {
      for (const fn of wildcard) {
        try {
          fn(event);
        } catch {
          // Protect dispatch loop
        }
      }
    }
  }

  private updateStatus(newStatus: WebSocketStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;
    for (const listener of this.statusListeners) {
      try {
        listener(newStatus);
      } catch {
        // Protect status notifications
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.explicitDisconnect || this.reconnectTimer) return;

    this.reconnectAttempts += 1;
    // Exponential backoff: 1s, 2s, 4s, 8s, up to 15s max
    const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 15000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delayMs);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'PING' });
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

/**
 * Shared singleton WebSocket client for the mobile application.
 */
export const gokiWebSocket = new GokiWebSocketClient();
