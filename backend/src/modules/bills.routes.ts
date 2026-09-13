// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { emit } from '../lib/socket.js';
import { nextBillNumber } from '../utils/counters.js';

const router = Router();

// GET /bills?sessionId=&status=
router.get('/', auth, authorize('ADMIN', 'MANAGER', 'WAITER', 'CASHIER'), async (req: AuthRequest, res, next) => {
  try {
    const { sessionId, status } = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (sessionId) where.sessionId = sessionId;
    if (status) where.status = status;
    const bills = await prisma.bill.findMany({
      where,
      include: { session: { include: { table: true } }, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: bills });
  } catch (e) { next(e); }
});

// GET /bills/:id
router.get('/:id', auth, authorize('ADMIN', 'MANAGER', 'WAITER', 'CASHIER'), async (req: AuthRequest, res, next) => {
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: (req.params.id as string) },
      include: { session: { include: { table: true, orders: { include: { items: true } } } }, payments: true },
    });
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
    res.json({ success: true, data: bill });
  } catch (e) { next(e); }
});

// POST /bills/from-session - generate bill from session's orders (aggregates subtotal/tax/total)
router.post('/from-session', auth, authorize('ADMIN', 'MANAGER', 'WAITER', 'CASHIER', 'CUSTOMER'), async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      sessionId: z.string().min(1),
      // optional explicit status, default OPEN
    });
    const { sessionId } = schema.parse(req.body);

    const session = await prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: { orders: { include: { items: true } }, table: true, bills: true },
    });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    // if open bill already exists, return it (idempotent by session)
    const openBill = session.bills.find(b => b.status === 'OPEN');
    if (openBill) {
      const full = await prisma.bill.findUnique({ where: { id: openBill.id }, include: { payments: true, session: { include: { table: true } } } });
      return res.json({ success: true, data: full, idempotent: true });
    }

    const billableStatuses = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'];
    const billableOrders = session.orders.filter(o => billableStatuses.includes(o.status));
    // include non-cancelled only
    if (billableOrders.length === 0) return res.status(400).json({ success: false, error: 'No billable orders in session' });

    let subtotal = 0;
    let taxTotal = 0;
    for (const o of billableOrders) {
      subtotal += o.subtotal;
      taxTotal += o.taxTotal;
    }
    const total = subtotal + taxTotal;

    // Check if there's already a bill whose total matches without creating duplicate on concurrent calls - use transaction
    const billNumber = await nextBillNumber();
    const bill = await prisma.bill.create({
      data: {
        billNumber,
        sessionId,
        subtotal,
        taxTotal,
        total,
        status: 'OPEN',
      },
      include: { session: { include: { table: true } }, payments: true },
    });

    await audit(req.user?.id ?? null, 'CREATE', 'Bill', bill.id, { sessionId, billNumber, total });
    emit('bill:created', bill);
    res.status(201).json({ success: true, data: bill });
  } catch (e) { next(e); }
});

// POST /bills/:id/close - mark bill CLOSED and close session, free table
router.post('/:id/close', auth, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req: AuthRequest, res, next) => {
  try {
    const id = (req.params as any).id as string;
    const bill = await prisma.bill.findUnique({ where: { id: id as string }, include: { payments: true } });
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
    if (bill.status === 'CLOSED') return res.json({ success: true, data: bill, message: 'Already closed' });
    if (bill.status === 'VOIDED') return res.status(400).json({ success: false, error: 'Cannot close voided bill' });

    // ensure fully paid or cash override? Require at least one successful payment covering total for non-void
    // For now allow closing; payments module handles settlement. Enforcement optional: check paid amount >= total or allow manager override
    const paidAmount = bill.payments.filter((p: any) => p.status === 'SUCCESS').reduce((s: number, p: any) => s + p.amount, 0);
    // Don't block if no payment yet but warn - we allow closing with zero payment for now; frontend decides

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.bill.update({ where: { id: id as string }, data: { status: 'CLOSED' } });
      const session = await tx.tableSession.findUnique({ where: { id: bill.sessionId } });
      if (session && session.status === 'ACTIVE') {
        await tx.tableSession.update({ where: { id: session.id }, data: { status: 'CLOSED', closedAt: new Date() } });
        await tx.table.update({ where: { id: session.tableId }, data: { status: 'AVAILABLE' } });
      }
      return tx.bill.findUnique({ where: { id: id as string }, include: { session: { include: { table: true } }, payments: true } });
    });

    await audit(req.user?.id ?? null, 'CLOSE', 'Bill', id as string, { paidAmount, total: bill.total });
    emit('bill:closed', updated);
    if (updated?.session) emit('table:available', { tableId: updated.session.tableId });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// POST /bills/:id/void
router.post('/:id/void', auth, authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const id = (req.params as any).id as string;
    const bill = await prisma.bill.findUnique({ where: { id: id as string } });
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
    if (bill.status === 'CLOSED') return res.status(400).json({ success: false, error: 'Cannot void closed bill' });
    if (bill.status === 'VOIDED') return res.json({ success: true, data: bill, message: 'Already voided' });
    const updated = await prisma.bill.update({ where: { id: id as string }, data: { status: 'VOIDED' } });
    await audit(req.user?.id ?? null, 'VOID', 'Bill', id as string, {});
    emit('bill:voided', updated);
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

export default router;
