import { useEffect, useState } from 'react';
import { WebSocketStatus, gymifyWebSocket } from '../api/websocketClient';

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
  const [status, setStatus] = useState<WebSocketStatus>(gymifyWebSocket.getStatus());
  const [isConnected, setIsConnected] = useState<boolean>(gymifyWebSocket.isConnected());

  const room = options?.room;
  const onMessage = options?.onMessage;
  const autoConnect = options?.autoConnect ?? true;

  // Listen for connection status changes
  useEffect(() => {
    const unbindStatus = gymifyWebSocket.onStatusChange((newStatus) => {
      setStatus(newStatus);
      setIsConnected(newStatus === 'connected');
    });

    if (autoConnect && !gymifyWebSocket.isConnected()) {
      void gymifyWebSocket.connect();
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
      gymifyWebSocket.subscribe(r);
    }

    return () => {
      for (const r of rooms) {
        gymifyWebSocket.unsubscribe(r);
      }
    };
  }, [roomKey]);

  // Attach optional message listener
  useEffect(() => {
    if (!onMessage) return;
    const unbind = gymifyWebSocket.on('*', onMessage);
    return () => unbind();
  }, [onMessage]);

  return {
    status,
    isConnected,
    subscribe: (r: string) => gymifyWebSocket.subscribe(r),
    unsubscribe: (r: string) => gymifyWebSocket.unsubscribe(r),
    send: (payload: Record<string, unknown>) => gymifyWebSocket.send(payload),
  };
}
