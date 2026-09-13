// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { emit } from '../lib/socket.js';

const router = Router();

const KITCHEN_STATUSES = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'] as const;
const kitchenPatchSchema = z.object({
  status: z.enum(['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']),
});

// GET /kitchen - KOT queue (filter by status, order by createdAt)
router.get('/', auth, authorize('ADMIN', 'MANAGER', 'CHEF', 'WAITER'), async (req: AuthRequest, res, next) => {
  try {
    const { status } = req.query as { status?: string };
    // Default queue: NEW, CONFIRMED, PREPARING, READY
    const where: any = {};
    if (status) {
      if (!KITCHEN_STATUSES.includes(status as any)) return res.status(400).json({ success: false, error: `Invalid status ${status}` });
      where.status = status;
    } else {
      where.status = { in: ['NEW', 'CONFIRMED', 'PREPARING', 'READY'] };
    }
    const queue = await prisma.kitchenOrder.findMany({
      where,
      include: {
        order: {
          include: {
            items: { include: { menuItem: true } },
            session: { include: { table: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    // fallback: also attach order status, handle missing table relation
    res.json({ success: true, data: queue });
  } catch (e) { next(e); }
});

// GET /kitchen/:id
router.get('/:id', auth, authorize('ADMIN', 'MANAGER', 'CHEF', 'WAITER'), async (req: AuthRequest, res, next) => {
  try {
    const ko = await prisma.kitchenOrder.findUnique({
      where: { id: (req.params.id as string) },
      include: { order: { include: { items: { include: { menuItem: true } }, session: { include: { table: true } } } } },
    });
    if (!ko) return res.status(404).json({ success: false, error: 'Kitchen order not found' });
    res.json({ success: true, data: ko });
  } catch (e) { next(e); }
});

// PATCH /kitchen/:id/status - kitchen status update, mirrors order status
router.patch('/:id/status', auth, authorize('ADMIN', 'MANAGER', 'CHEF'), async (req: AuthRequest, res, next) => {
  try {
    const { status: nextStatus } = kitchenPatchSchema.parse(req.body);
    const id = (req.params as any).id as string;

    const ko = await prisma.kitchenOrder.findUnique({ where: { id: id as string }, include: { order: true } });
    if (!ko) return res.status(404).json({ success: false, error: 'Kitchen order not found' });

    const current = ko.status;

    // Allowed kitchen transitions (linear + cancel)
    const KITCHEN_TRANSITIONS: Record<string, string[]> = {
      NEW: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY', 'CANCELLED'],
      READY: ['SERVED'],
      SERVED: [],
      CANCELLED: [],
    };
    const allowed = KITCHEN_TRANSITIONS[current] ?? [];
    // allow skip CONFIRMED -> PREPARING directly from NEW for speed
    const isFastTrack = current === 'NEW' && nextStatus === 'PREPARING';
    if (!allowed.includes(nextStatus) && !isFastTrack) {
      return res.status(400).json({ success: false, error: `Invalid kitchen transition ${current} -> ${nextStatus}. Allowed: ${allowed.join(', ') || 'none'}` });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedKo = await tx.kitchenOrder.update({ where: { id: id as string }, data: { status: nextStatus } });
      // sync order status
      const orderStatusMap: Record<string, string> = {
        CONFIRMED: 'CONFIRMED',
        PREPARING: 'PREPARING',
        READY: 'READY',
        SERVED: 'SERVED',
        CANCELLED: 'CANCELLED',
      };
      const orderStatus = orderStatusMap[nextStatus];
      if (orderStatus) {
        await tx.order.update({ where: { id: ko.orderId }, data: { status: orderStatus } });
        await tx.orderStatusHistory.create({
          data: { orderId: ko.orderId, fromStatus: (ko as any).order.status === nextStatus ? null : (ko as any).order.status, toStatus: orderStatus, changedById: req.user?.id ?? null },
        });
      }
      return tx.kitchenOrder.findUnique({ where: { id: id as string }, include: { order: { include: { items: true } } } });
    });

    await audit(req.user?.id ?? null, 'UPDATE_KITCHEN_STATUS', 'KitchenOrder', id as string, { from: current, to: nextStatus });
    emit('kitchen:order:updated', updated);
    emit('order:status:changed', { orderId: ko.orderId, from: current, to: nextStatus });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// GET /kitchen/order/:orderId - find kitchen order by orderId
router.get('/order/:orderId', auth, authorize('ADMIN', 'MANAGER', 'CHEF', 'WAITER'), async (req: AuthRequest, res, next) => {
  try {
    const ko = await prisma.kitchenOrder.findUnique({
      where: { orderId: (req.params as any).orderId as string },
      include: { order: { include: { items: { include: { menuItem: true } } } } },
    });
    if (!ko) return res.status(404).json({ success: false, error: 'Kitchen order not found' });
    res.json({ success: true, data: ko });
  } catch (e) { next(e); }
});

export default router;
