// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { emit } from '../lib/socket.js';
import { nextOrderNumber } from '../utils/counters.js';

const router = Router();

// Allowed status transitions
const ORDER_TRANSITIONS: Record<string, string[]> = {
  NEW: ['CONFIRMED', 'ACCEPTED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED'],
  SERVED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

const orderItemInput = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(100),
  notes: z.string().max(500).optional(),
});

const orderCreateSchema = z.object({
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'ROOM_SERVICE']).optional(),
  customerId: z.string().optional(),
  sessionId: z.string().optional(),
  tableId: z.string().optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
  specialInstructions: z.string().max(1000).optional(),
  items: z.array(orderItemInput).min(1).max(50),
});

const statusSchema = z.object({
  status: z.enum(['NEW', 'CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED']),
});

// GET /orders?sessionId=&customerId=&tableId=&status=&type=
router.get('/', async (req, res, next) => {
  try {
    const { sessionId, customerId, tableId, status, type } = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (sessionId) where.sessionId = sessionId;
    if (customerId) where.customerId = customerId;
    if (tableId) where.tableId = tableId;
    if (status) where.status = status;
    if (type) where.type = type;

    const orders = await prisma.order.findMany({
      where,
      include: { items: { include: { menuItem: true } }, kitchenOrder: true, session: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: orders });
  } catch (e) { next(e); }
});

// GET /orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: (req.params.id as string) },
      include: { items: { include: { menuItem: true } }, kitchenOrder: true, statusHistory: { orderBy: { createdAt: 'asc' } }, session: true, payment: true },
    });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (e) { next(e); }
});

// POST /orders - create with idempotency + validation, prices from DB
router.post('/', async (req, res, next) => {
  try {
    const parsed = orderCreateSchema.parse(req.body);

    // Idempotency: if key provided and order exists, return it (safe retry)
    if (parsed.idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey: parsed.idempotencyKey },
        include: { items: true, kitchenOrder: true },
      });
      if (existing) return res.json({ success: true, data: existing, idempotent: true });
    }

    // Validate related entities
    if (parsed.customerId) {
      const c = await prisma.customer.findUnique({ where: { id: parsed.customerId } });
      if (!c) return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    if (parsed.sessionId) {
      const s = await prisma.tableSession.findUnique({ where: { id: parsed.sessionId } });
      if (!s) return res.status(404).json({ success: false, error: 'TableSession not found' });
      if (s.status !== 'ACTIVE') return res.status(400).json({ success: false, error: 'TableSession is not active' });
    }
    if (parsed.tableId) {
      const t = await prisma.table.findUnique({ where: { id: parsed.tableId } });
      if (!t) return res.status(404).json({ success: false, error: 'Table not found' });
    }

    // Validate items, compute totals from DB prices (client cannot spoof amount)
    const menuItemIds = parsed.items.map(i => i.menuItemId);
    const menuItems = await prisma.menuItem.findMany({ where: { id: { in: menuItemIds } } });
    const menuMap = new Map(menuItems.map(m => [m.id, m]));

    const errors: string[] = [];
    for (const it of parsed.items) {
      const mi = menuMap.get(it.menuItemId);
      if (!mi) errors.push(`MenuItem ${it.menuItemId} not found`);
      else if (!mi.isAvailable) errors.push(`Item "${mi.name}" is not available`);
    }
    if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });

    // Compute amounts
    let subtotal = 0;
    let taxTotal = 0;
    const computedItems = parsed.items.map(it => {
      const mi = menuMap.get(it.menuItemId)!;
      const amount = mi.price * it.quantity;
      const tax = Math.round((amount * (mi.taxPercent || 0)) / 100);
      subtotal += amount;
      taxTotal += tax;
      return {
        menuItemId: mi.id,
        name: mi.name,
        price: mi.price,
        quantity: it.quantity,
        amount,
        notes: it.notes || null,
      };
    });
    const total = subtotal + taxTotal;
    const orderNumber = await nextOrderNumber();

    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          orderNumber,
          type: parsed.type ?? 'DINE_IN',
          status: 'NEW',
          customerId: parsed.customerId || null,
          sessionId: parsed.sessionId || null,
          tableId: parsed.tableId || null,
          idempotencyKey: parsed.idempotencyKey || null,
          subtotal,
          taxTotal,
          total,
          specialInstructions: parsed.specialInstructions || null,
          items: { create: computedItems },
        },
        include: { items: true },
      });
      await tx.kitchenOrder.create({ data: { orderId: o.id, status: 'NEW' } });
      await tx.orderStatusHistory.create({ data: { orderId: o.id, fromStatus: null, toStatus: 'NEW', changedById: null } });
      return tx.order.findUnique({ where: { id: o.id }, include: { items: { include: { menuItem: true } }, kitchenOrder: true } });
    });

    await audit(parsed.customerId ?? null, 'CREATE', 'Order', order!.id, { orderNumber, total, items: parsed.items.length });
    emit('order:created', order);
    emit('kitchen:order:created', { orderId: order!.id, kitchenOrder: order!.kitchenOrder });
    res.status(201).json({ success: true, data: order });
  } catch (e) { next(e); }
});

// PATCH /orders/:id/status - validated transitions
router.patch('/:id/status', auth, authorize('ADMIN', 'MANAGER', 'CHEF', 'WAITER'), async (req: AuthRequest, res, next) => {
  try {
    let { status: nextStatus } = statusSchema.parse(req.body);
    if (nextStatus === 'ACCEPTED') nextStatus = 'CONFIRMED';
    const id = (req.params as any).id as string;
    const order = await prisma.order.findUnique({ where: { id: id as string }, include: { kitchenOrder: true } });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    const current = order.status;
    if (current === nextStatus) return res.json({ success: true, data: order, message: 'Already at this status' });

    const allowed = ORDER_TRANSITIONS[current] ?? [];
    // ADMIN can force CANCELLED from any non-terminal except COMPLETED; keep strict for others
    const isPrivileged = req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER';
    if (!allowed.includes(nextStatus)) {
      // allow MANAGER/ADMIN to cancel from any cancellable state not already terminal
      if (!(nextStatus === 'CANCELLED' && isPrivileged && current !== 'COMPLETED' && current !== 'CANCELLED' && current !== 'SERVED')) {
        return res.status(400).json({ success: false, error: `Invalid transition ${current} -> ${nextStatus}. Allowed: ${allowed.join(', ') || 'none'}` });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({ where: { id: id as string }, data: { status: nextStatus } });
      await tx.orderStatusHistory.create({ data: { orderId: id as string, fromStatus: current, toStatus: nextStatus, changedById: req.user?.id ?? null } });
      // keep kitchen order in sync for relevant statuses
      if (order.kitchenOrder && ['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'].includes(nextStatus)) {
        const kitchenMap: Record<string, string> = { CONFIRMED: 'CONFIRMED', PREPARING: 'PREPARING', READY: 'READY', SERVED: 'SERVED', CANCELLED: 'CANCELLED' };
        const kStatus = kitchenMap[nextStatus];
        if (kStatus) await tx.kitchenOrder.update({ where: { orderId: id }, data: { status: kStatus } });
      }
      return tx.order.findUnique({ where: { id: id as string }, include: { items: true, kitchenOrder: true, statusHistory: { orderBy: { createdAt: 'asc' } } } });
    });

    await audit(req.user?.id ?? null, 'STATUS_CHANGE', 'Order', id as string, { from: current, to: nextStatus });
    emit('order:status:changed', { orderId: id as string, from: current, to: nextStatus, order: updated });
    if (updated?.kitchenOrder) emit('kitchen:order:updated', updated.kitchenOrder);
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// DELETE /orders/:id - only NEW/CANCELLED can be hard deleted (admin)
router.delete('/:id', auth, authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const id = (req.params as any).id as string;
    const existing = await prisma.order.findUnique({ where: { id: id as string } });
    if (!existing) return res.status(404).json({ success: false, error: 'Order not found' });
    if (!['NEW', 'CANCELLED'].includes(existing.status)) return res.status(400).json({ success: false, error: `Cannot delete order with status ${existing.status}` });
    await prisma.order.delete({ where: { id: id as string } });
    await audit(req.user?.id ?? null, 'DELETE', 'Order', id as string, {});
    emit('order:deleted', { id });
    res.json({ success: true, message: 'Order deleted' });
  } catch (e) { next(e); }
});

export default router;
