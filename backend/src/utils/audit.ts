import { prisma } from '../lib/prisma.js';
export async function audit(userId: string | null, action: string, entity: string, entityId?: string, metadata?: any) {
  try {
    await prisma.auditLog.create({ data: { userId, action, entity, entityId, metadata: metadata ? JSON.stringify(metadata) : null } });
  } catch {}
}
