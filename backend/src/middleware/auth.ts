import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth.js';

export interface AuthRequest extends Request {
  user?: { id: string; role: string; email: string };
}

export function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch { return res.status(401).json({ success: false, error: 'Invalid token' }); }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ success: false, error: 'Forbidden' });
    next();
  };
}
