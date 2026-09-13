'use client';
import { io, Socket } from 'socket.io-client';
let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (socket) return socket;
  const url = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';
  // If WS_URL is explicitly empty in env, realtime is disabled (e.g. Vercel-only REST)
  if (!url || url === 'disabled') {
    console.warn('[socket] NEXT_PUBLIC_WS_URL=disabled, realtime off (polling fallback)');
    return null;
  }
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  socket = io(url, { auth: token ? { token } : undefined, transports: ['websocket', 'polling'] });
  socket.on('connect_error', (e) => console.warn('[socket] connect_error', e.message));
  return socket;
}
export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
