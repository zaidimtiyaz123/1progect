'use client';
import { io, Socket } from 'socket.io-client';
let socket:Socket|null=null;
export function getSocket():Socket{
  if(socket) return socket;
  const url = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';
  const token = typeof window!=='undefined'? localStorage.getItem('token'): null;
  socket = io(url, { auth: token?{token}:undefined, transports:['websocket','polling'] });
  return socket;
}
export function closeSocket(){ if(socket){ socket.disconnect(); socket=null; } }
