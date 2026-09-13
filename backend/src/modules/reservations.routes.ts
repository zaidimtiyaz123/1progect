// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { emit } from '../lib/socket.js';

const router = Router();

const SLOT_MINUTES = 120; // each reservation blocks 2h

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) throw new Error(`Invalid time ${t}`);
  return h * 60 + m;
}
function overlaps(aStart: number, bStart: number, slot = SLOT_MINUTES) {
  return Math.abs(aStart - bStart) < slot;
}

const reservationCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:mm'),
  guestCount: z.number().int().min(1).max(50),
  name: z.string().min(1).max(100),
  phone: z.string().min(6).max(20),
  specialRequest: z.string().max(500).optional(),
  tableId: z.string().optional(),
  customerId: z.string().optional(),
});

const reservationUpdateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  guestCount: z.number().int().min(1).max(50).optional(),
  name: z.string().min(1).max(100).optional(),
  phone: z.string().min(6).max(20).optional(),
  specialRequest: z.string().max(500).optional().nullable(),
  tableId: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
});

// Shared availability checker
async function hasOverlap(tableId: string, date: string, time: string, excludeId?: string): Promise<boolean> {
  const tMin = toMinutes(time);
  const existing = await prisma.reservation.findMany({
    where: {
      tableId,
      date,
      status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { time: true },
  });
  return existing.some(r => overlaps(tMin, toMinutes(r.time)));
}

async function findAvailableTables(date: string, time: string, guestCount: number, restaurantId?: string) {
  const tMin = toMinutes(time);
  // fetch candidate tables with capacity >= guestCount and active
  const tables = await prisma.table.findMany({
    where: {
      isActive: true,
      capacity: { gte: guestCount },
      ...(restaurantId ? { restaurantId } : {}),
    },
    orderBy: { capacity: 'asc' },
  });
  const reservations = await prisma.reservation.findMany({
    where: {
      date,
      status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
      tableId: { not: null },
    },
    select: { tableId: true, time: true },
  });
  // group reservations by table
  const blocked = new Set<string>();
  for (const r of reservations) {
    if (!r.tableId) continue;
    if (overlaps(tMin, toMinutes(r.time))) blocked.add(r.tableId);
  }
  return tables.filter(t => !blocked.has(t.id));
}

// GET /reservations?date=YYYY-MM-DD&status=PENDING&tableId=xxx
router.get('/', async (req, res, next) => {
  try {
    const { date, status, tableId, customerId } = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (date) where.date = date;
    if (status) where.status = status;
    if (tableId) where.tableId = tableId;
    if (customerId) where.customerId = customerId;
    const data = await prisma.reservation.findMany({
      where,
      include: { table: true, customer: { include: { user: true } } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// GET /reservations/availability?date=YYYY-MM-DD&time=HH:mm&guestCount=4&restaurantId=xxx
router.get('/availability', async (req, res, next) => {
  try {
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^\d{2}:\d{2}$/),
      guestCount: z.coerce.number().int().min(1).max(50),
      restaurantId: z.string().optional(),
    });
    const { date, time, guestCount, restaurantId } = schema.parse(req.query);
    const available = await findAvailableTables(date, time, guestCount, restaurantId);
    res.json({ success: true, data: available });
  } catch (e) { next(e); }
});

// GET /reservations/:id
router.get('/:id', async (req, res, next) => {
  try {
    const r = await prisma.reservation.findUnique({
      where: { id: (req.params.id as string) },
      include: { table: true, customer: true },
    });
    if (!r) return res.status(404).json({ success: false, error: 'Reservation not found' });
    res.json({ success: true, data: r });
  } catch (e) { next(e); }
});

// POST /reservations
router.post('/', async (req, res, next) => {
  try {
    const parsed = reservationCreateSchema.parse(req.body);

    // validate time legality
    try { toMinutes(parsed.time); } catch (err: any) { return res.status(400).json({ success: false, error: err.message }); }

    // if tableId provided, validate availability & capacity
    if (parsed.tableId) {
      const table = await prisma.table.findUnique({ where: { id: parsed.tableId } });
      if (!table) return res.status(404).json({ success: false, error: 'Table not found' });
      if (!table.isActive) return res.status(400).json({ success: false, error: 'Table inactive' });
      if (table.capacity < parsed.guestCount) return res.status(400).json({ success: false, error: `Table capacity ${table.capacity} < guestCount ${parsed.guestCount}` });
      if (await hasOverlap(parsed.tableId, parsed.date, parsed.time)) {
        return res.status(409).json({ success: false, error: 'Table already reserved at this time slot' });
      }
    }

    if (parsed.customerId) {
      const c = await prisma.customer.findUnique({ where: { id: parsed.customerId } });
      if (!c) return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const reservation = await prisma.reservation.create({
      data: {
        date: parsed.date,
        time: parsed.time,
        guestCount: parsed.guestCount,
        name: parsed.name,
        phone: parsed.phone,
        specialRequest: parsed.specialRequest || null,
        tableId: parsed.tableId || null,
        customerId: parsed.customerId || null,
        status: 'PENDING',
      },
    });
    await audit(null, 'CREATE', 'Reservation', reservation.id, parsed);
    emit('reservation:created', reservation);
    res.status(201).json({ success: true, data: reservation });
  } catch (e) { next(e); }
});

// PUT /reservations/:id
router.put('/:id', auth, authorize('ADMIN', 'MANAGER', 'WAITER'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = reservationUpdateSchema.parse(req.body);
    const id = (req.params as any).id as string;
    const existing = await prisma.reservation.findUnique({ where: { id: id as string } });
    if (!existing) return res.status(404).json({ success: false, error: 'Reservation not found' });
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(existing.status)) {
      return res.status(400).json({ success: false, error: `Cannot update ${existing.status} reservation` });
    }

    const nextDate = parsed.date ?? existing.date;
    const nextTime = parsed.time ?? existing.time;
    const nextTableId = parsed.tableId !== undefined ? parsed.tableId : existing.tableId;

    if (parsed.time) { try { toMinutes(parsed.time); } catch (err: any) { return res.status(400).json({ success: false, error: err.message }); } }

    if (nextTableId) {
      const table = await prisma.table.findUnique({ where: { id: nextTableId } });
      if (!table) return res.status(404).json({ success: false, error: 'Table not found' });
      const gc = parsed.guestCount ?? existing.guestCount;
      if (table.capacity < gc) return res.status(400).json({ success: false, error: `Table capacity ${table.capacity} < guestCount ${gc}` });
      if (await hasOverlap(nextTableId, nextDate, nextTime, id)) {
        return res.status(409).json({ success: false, error: 'Table already reserved at this time slot' });
      }
    }

    const updated = await prisma.reservation.update({
      where: { id: id as string },
      data: {
        date: parsed.date,
        time: parsed.time,
        guestCount: parsed.guestCount,
        name: parsed.name,
        phone: parsed.phone,
        specialRequest: parsed.specialRequest !== undefined ? parsed.specialRequest : undefined,
        tableId: parsed.tableId !== undefined ? parsed.tableId : undefined,
        status: parsed.status,
      },
    });
    await audit(req.user?.id ?? null, 'UPDATE', 'Reservation', id, parsed);
    emit('reservation:updated', updated);
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// POST /reservations/:id/check-in - marks SEATED, creates TableSession, updates table status
router.post('/:id/check-in', auth, authorize('ADMIN', 'MANAGER', 'WAITER'), async (req: AuthRequest, res, next) => {
  try {
    const id = (req.params as any).id as string;
    const reservation = await prisma.reservation.findUnique({ where: { id: id as string } });
    if (!reservation) return res.status(404).json({ success: false, error: 'Reservation not found' });
    if (!reservation.tableId) return res.status(400).json({ success: false, error: 'Reservation has no table assigned' });
    if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) {
      return res.status(400).json({ success: false, error: `Cannot check-in reservation with status ${reservation.status}` });
    }

    const table = await prisma.table.findUnique({ where: { id: reservation.tableId } });
    if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

    // Ensure no active session for this table
    const activeSession = await prisma.tableSession.findFirst({
      where: { tableId: reservation.tableId, status: 'ACTIVE' },
    });
    if (activeSession) return res.status(409).json({ success: false, error: 'Table already has an active session' });

    const result = await prisma.$transaction(async (tx) => {
      const updatedRes = await tx.reservation.update({ where: { id: id as string }, data: { status: 'SEATED' } });
      const session = await tx.tableSession.create({
        data: {
          tableId: reservation.tableId!,
          customerId: reservation.customerId,
          status: 'ACTIVE',
          partySize: reservation.guestCount,
        },
      });
      await tx.table.update({ where: { id: reservation.tableId! }, data: { status: 'OCCUPIED' } });
      return { reservation: updatedRes, session };
    });

    await audit(req.user?.id ?? null, 'CHECK_IN', 'Reservation', id, { sessionId: result.session.id });
    emit('reservation:checked_in', result);
    emit('table:occupied', { tableId: reservation.tableId, session: result.session });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

// POST /reservations/:id/cancel
router.post('/:id/cancel', auth, authorize('ADMIN', 'MANAGER', 'WAITER'), async (req: AuthRequest, res, next) => {
  try {
    const id = (req.params as any).id as string;
    const existing = await prisma.reservation.findUnique({ where: { id: id as string } });
    if (!existing) return res.status(404).json({ success: false, error: 'Reservation not found' });
    if (['COMPLETED', 'CANCELLED'].includes(existing.status)) return res.status(400).json({ success: false, error: `Already ${existing.status}` });
    const updated = await prisma.reservation.update({ where: { id: id as string }, data: { status: 'CANCELLED' } });
    await audit(req.user?.id ?? null, 'CANCEL', 'Reservation', id, {});
    emit('reservation:cancelled', updated);
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// DELETE /reservations/:id (hard delete only if PENDING/CANCELLED)
router.delete('/:id', auth, authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const id = (req.params as any).id as string;
    const existing = await prisma.reservation.findUnique({ where: { id: id as string } });
    if (!existing) return res.status(404).json({ success: false, error: 'Reservation not found' });
    if (!['PENDING', 'CANCELLED', 'NO_SHOW'].includes(existing.status)) {
      return res.status(400).json({ success: false, error: `Cannot delete reservation with status ${existing.status}` });
    }
    await prisma.reservation.delete({ where: { id: id as string } });
    await audit(req.user?.id ?? null, 'DELETE', 'Reservation', id, {});
    emit('reservation:deleted', { id });
    res.json({ success: true, message: 'Reservation deleted' });
  } catch (e) { next(e); }
});

export default router;
