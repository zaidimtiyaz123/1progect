// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { emit } from '../lib/socket.js';

const router = Router();

const paymentCreateSchema = z.object({
  billId: z.string().optional(),
  orderId: z.string().optional(),
  amount: z.number().int().min(1),
  method: z.enum(['CASH', 'CARD', 'UPI', 'ONLINE', 'WALLET']),
  gatewayPaymentId: z.string().optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
}).refine(d => d.billId || d.orderId, { message: 'Either billId or orderId is required' });

// GET /payments?billId=&orderId=&status=
router.get('/', auth, authorize('ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'CUSTOMER'), async (req: AuthRequest, res, next) => {
  try {
    const { billId, orderId, status } = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (billId) where.billId = billId;
    if (orderId) where.orderId = orderId;
    if (status) where.status = status;
    const payments = await prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ success: true, data: payments });
  } catch (e) { next(e); }
});

// GET /payments/:id
router.get('/:id', auth, authorize('ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'CUSTOMER'), async (req: AuthRequest, res, next) => {
  try {
    const p = await prisma.payment.findUnique({ where: { id: (req.params.id as string) } });
    if (!p) return res.status(404).json({ success: false, error: 'Payment not found' });
    res.json({ success: true, data: p });
  } catch (e) { next(e); }
});

// POST /payments - create payment (idempotent by idempotencyKey)
router.post('/', auth, authorize('ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'CUSTOMER'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = paymentCreateSchema.parse(req.body);

    if (parsed.idempotencyKey) {
      const existing = await prisma.payment.findUnique({ where: { idempotencyKey: parsed.idempotencyKey } });
      if (existing) return res.json({ success: true, data: existing, idempotent: true });
    }

    let bill: any = null;
    let order: any = null;
    if (parsed.billId) {
      bill = await prisma.bill.findUnique({ where: { id: parsed.billId } });
      if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
      if (bill.status === 'VOIDED') return res.status(400).json({ success: false, error: 'Cannot pay voided bill' });
      if (bill.status === 'CLOSED') return res.status(400).json({ success: false, error: 'Bill already closed' });
    }
    if (parsed.orderId) {
      order = await prisma.order.findUnique({ where: { id: parsed.orderId } });
      if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Validate amount does not exceed bill remaining (if billId)
    if (bill) {
      const paid = await prisma.payment.findMany({ where: { billId: bill.id, status: 'SUCCESS' } });
      const paidTotal = paid.reduce((s, p) => s + p.amount, 0);
      const remaining = bill.total - paidTotal;
      if (parsed.amount > remaining) {
        return res.status(400).json({ success: false, error: `Amount ${parsed.amount} exceeds remaining ${remaining}` });
      }
    }

    // For CASH, auto-mark SUCCESS; for ONLINE/CARD/UPI mark PENDING until webhook verifies
    const isCash = parsed.method === 'CASH';
    const payment = await prisma.payment.create({
      data: {
        billId: parsed.billId || null,
        orderId: parsed.orderId || null,
        amount: parsed.amount,
        method: parsed.method,
        status: isCash ? 'SUCCESS' : 'PENDING',
        gatewayPaymentId: parsed.gatewayPaymentId || null,
        idempotencyKey: parsed.idempotencyKey || null,
      },
    });

    // If cash success and bill fully paid, optionally emit but don't auto-close; bills.routes handles close
    if (isCash && bill) {
      const allPaid = await prisma.payment.findMany({ where: { billId: bill.id, status: 'SUCCESS' } });
      const totalPaid = allPaid.reduce((s, p) => s + p.amount, 0);
      if (totalPaid >= bill.total) {
        emit('bill:fully_paid', { billId: bill.id, totalPaid });
      }
    }

    await audit(req.user?.id ?? null, 'CREATE', 'Payment', payment.id, { amount: payment.amount, method: payment.method, billId: parsed.billId });
    emit('payment:created', payment);
    res.status(201).json({ success: true, data: payment });
  } catch (e) { next(e); }
});

// POST /payments/webhook - idempotent webhook for gateway callbacks
// Body: { gatewayPaymentId, status: 'SUCCESS'|'FAILED', amount?, signature? }
// Signature verification: HMAC SHA256 of gatewayPaymentId using PAYMENT_WEBHOOK_SECRET
router.post('/webhook', async (req, res, next) => {
  try {
    const schema = z.object({
      gatewayPaymentId: z.string().min(1),
      status: z.enum(['SUCCESS', 'FAILED']),
      amount: z.number().int().optional(),
      signature: z.string().optional(),
      paymentId: z.string().optional(), // internal payment id if gateway echoes it
      idempotencyKey: z.string().optional(),
    });
    const parsed = schema.parse(req.body);

    // Optional signature verification
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (secret && parsed.signature) {
      const expected = crypto.createHmac('sha256', secret).update(parsed.gatewayPaymentId).digest('hex');
      // also allow signature of body JSON alternative: hmac of gatewayPaymentId+status
      const expected2 = crypto.createHmac('sha256', secret).update(`${parsed.gatewayPaymentId}:${parsed.status}`).digest('hex');
      const valid = parsed.signature === expected || parsed.signature === expected2;
      if (!valid) return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
    }

    // Idempotent lookup: find by gatewayPaymentId first, then by paymentId
    let payment: any = null;
    if (parsed.gatewayPaymentId) {
      payment = await prisma.payment.findUnique({ where: { gatewayPaymentId: parsed.gatewayPaymentId } });
    }
    if (!payment && parsed.paymentId) {
      payment = await prisma.payment.findUnique({ where: { id: parsed.paymentId } });
    }

    if (!payment) {
      // No existing payment: if webhook carries amount+idempotencyKey, create it (rare gateway-first flow)
      if (parsed.idempotencyKey) {
        const byKey = await prisma.payment.findUnique({ where: { idempotencyKey: parsed.idempotencyKey } });
        if (byKey) payment = byKey;
      }
      if (!payment) return res.status(404).json({ success: false, error: 'Payment not found for webhook' });
    }

    // Idempotent: if already terminal with same status, return 200 without duplicate side effects
    if (payment.status === parsed.status) {
      return res.json({ success: true, data: payment, idempotent: true });
    }
    // Don't allow SUCCESS->FAILED downgrade after success
    if (payment.status === 'SUCCESS' && parsed.status === 'FAILED') {
      return res.status(409).json({ success: false, error: 'Payment already succeeded, cannot mark failed' });
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: parsed.status },
    });

    await audit(null, 'WEBHOOK', 'Payment', payment.id, { gatewayPaymentId: parsed.gatewayPaymentId, status: parsed.status });

    if (parsed.status === 'SUCCESS' && updated.billId) {
      const bill = await prisma.bill.findUnique({ where: { id: updated.billId }, include: { payments: true } });
      if (bill) {
        const totalPaid = bill.payments.filter(p => p.status === 'SUCCESS').reduce((s, p) => s + p.amount, 0);
        if (totalPaid >= bill.total) emit('bill:fully_paid', { billId: bill.id, totalPaid });
      }
    }

    emit('payment:webhook', { paymentId: payment.id, status: parsed.status, gatewayPaymentId: parsed.gatewayPaymentId });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// POST /payments/:id/verify - manual verify (checks gatewayPaymentId present and mocks verification)
router.post('/:id/verify', auth, authorize('ADMIN', 'MANAGER', 'CASHIER', 'WAITER'), async (req: AuthRequest, res, next) => {
  try {
    const id = (req.params as any).id as string;
    const payment = await prisma.payment.findUnique({ where: { id: id as string } });
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
    if (payment.status === 'SUCCESS') return res.json({ success: true, data: payment, message: 'Already verified' });
    if (!payment.gatewayPaymentId) return res.status(400).json({ success: false, error: 'No gatewayPaymentId to verify' });

    // In production, call gateway API here. For now, verify by checking signature if provided
    const { signature } = z.object({ signature: z.string().optional() }).parse(req.body || {});
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (secret && signature) {
      const expected = crypto.createHmac('sha256', secret).update(payment.gatewayPaymentId).digest('hex');
      if (signature !== expected) return res.status(401).json({ success: false, error: 'Invalid verify signature' });
    }

    const updated = await prisma.payment.update({ where: { id: id as string }, data: { status: 'SUCCESS' } });
    await audit(req.user?.id ?? null, 'VERIFY', 'Payment', id, {});
    emit('payment:verified', updated);
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// POST /payments/:id/refund
router.post('/:id/refund', auth, authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const id = (req.params as any).id as string;
    const payment = await prisma.payment.findUnique({ where: { id: id as string } });
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
    if (payment.status !== 'SUCCESS') return res.status(400).json({ success: false, error: `Cannot refund payment with status ${payment.status}` });
    const updated = await prisma.payment.update({ where: { id: id as string }, data: { status: 'REFUNDED' } });
    await audit(req.user?.id ?? null, 'REFUND', 'Payment', id, {});
    emit('payment:refunded', updated);
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

export default router;
