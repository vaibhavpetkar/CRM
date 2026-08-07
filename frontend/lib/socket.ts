import { io, Socket } from 'socket.io-client';
import { getAuthToken } from './api';

// Socket.IO connects to the bare server origin, not the /api-prefixed REST base.
const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

let socket: Socket | null = null;

/**
 * Returns a shared, lazily-created Socket.IO connection authenticated with the
 * current user's JWT. Re-uses the same socket across the app so we only hold
 * one connection per tab, and re-creates it if the token changes (e.g. re-login).
 */
export function getSocket(): Socket | null {
  const token = getAuthToken();
  if (!token) return null;

  if (socket && socket.auth && (socket.auth as any).token === token) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    // WebSocket-only, no long-polling fallback. This matters once the backend
    // runs multiple processes (PM2 cluster mode or multiple instances behind
    // a load balancer): a single WebSocket connection stays pinned to
    // whichever worker/instance accepted it for its whole lifetime, but
    // long-polling makes repeated HTTP requests that can land on a *different*
    // worker each time without sticky sessions — which breaks Engine.IO's
    // session handling. Going WebSocket-only avoids needing sticky sessions
    // at all.
    transports: ['websocket'],
    withCredentials: true,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
