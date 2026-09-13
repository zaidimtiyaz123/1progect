import { Server } from 'socket.io';
let io: Server | null = null;
export function setIO(server: Server) { io = server; }
export function getIO() { return io; }
export function emit(event: string, data: any) { io?.emit(event, data); }
export function emitToRoom(room: string, event: string, data: any) { io?.to(room).emit(event, data); }
