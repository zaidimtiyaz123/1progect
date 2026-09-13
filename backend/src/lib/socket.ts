import { Server } from 'socket.io';
let io: Server | null = null;
export function setIO(server: Server) { io = server; }
export function getIO() { return io; }
// Compat: allow require/vercel imports that expect default
// eslint-disable-next-line import/no-default-export
export default { setIO, getIO, emit: (event: string, data: any) => io?.emit(event, data), emitToRoom: (room: string, event: string, data: any) => io?.to(room).emit(event, data) };
export function emit(event: string, data: any) { io?.emit(event, data); }
export function emitToRoom(room: string, event: string, data: any) { io?.to(room).emit(event, data); }
