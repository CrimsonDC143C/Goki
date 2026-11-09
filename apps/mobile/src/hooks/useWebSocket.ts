import { useEffect, useState } from 'react';
import { WebSocketStatus, gokiWebSocket } from '../api/websocketClient';

export interface UseWebSocketOptions {
  /**
   * Room or list of rooms to subscribe to while the hosting component is mounted.
   * Automatically unsubscribed on unmount.
   */
  room?: string | string[];
  /**
   * Message event callback.
   */
  onMessage?: (event: any) => void;
  /**
   * Whether to trigger automatic connection if disconnected. Defaults to true.
   */
  autoConnect?: boolean;
}

/**
 * React hook for bi-directional WebSocket synchronization.
 * Manages room subscriptions, status observers, and message handlers.
 */
export function useWebSocket(options?: UseWebSocketOptions) {
  const [status, setStatus] = useState<WebSocketStatus>(gokiWebSocket.getStatus());
  const [isConnected, setIsConnected] = useState<boolean>(gokiWebSocket.isConnected());

  const room = options?.room;
  const onMessage = options?.onMessage;
  const autoConnect = options?.autoConnect ?? true;

  // Listen for connection status changes
  useEffect(() => {
    const unbindStatus = gokiWebSocket.onStatusChange((newStatus) => {
      setStatus(newStatus);
      setIsConnected(newStatus === 'connected');
    });

    if (autoConnect && !gokiWebSocket.isConnected()) {
      void gokiWebSocket.connect();
    }

    return () => {
      unbindStatus();
    };
  }, [autoConnect]);

  // Subscribe to room(s) on mount/change, cleanup on unmount
  const roomKey = Array.isArray(room) ? room.join(',') : room;
  useEffect(() => {
    if (!room) return;

    const rooms = Array.isArray(room) ? room : [room];
    for (const r of rooms) {
      gokiWebSocket.subscribe(r);
    }

    return () => {
      for (const r of rooms) {
        gokiWebSocket.unsubscribe(r);
      }
    };
  }, [roomKey]);

  // Attach optional message listener
  useEffect(() => {
    if (!onMessage) return;
    const unbind = gokiWebSocket.on('*', onMessage);
    return () => unbind();
  }, [onMessage]);

  return {
    status,
    isConnected,
    subscribe: (r: string) => gokiWebSocket.subscribe(r),
    unsubscribe: (r: string) => gokiWebSocket.unsubscribe(r),
    send: (payload: Record<string, unknown>) => gokiWebSocket.send(payload),
  };
}
