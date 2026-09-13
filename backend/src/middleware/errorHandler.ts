import { Request, Response, NextFunction } from 'express';
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ success: false, error: err.message || 'Internal server error' });
}
