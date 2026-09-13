import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const SECRET = process.env.JWT_SECRET || 'dev-secret-32chars-long-change-me!!';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

export function signToken(payload: { id: string; role: string; email: string }) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as any);
}
export function verifyToken(token: string) {
  return jwt.verify(token, SECRET) as { id: string; role: string; email: string };
}
