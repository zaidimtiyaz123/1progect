// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { getIO, emit, emitToRoom } from '../lib/socket.js';
import { audit } from '../utils/audit.js';

const router = Router();

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------
const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'OUT_OF_ORDER'] as const;
const SESSION_STATUSES = ['ACTIVE', 'CLOSED', 'ABANDONED'] as const;

type TableStatus = (typeof TABLE_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ['OCCUPIED', 'RESERVED', 'OUT_OF_ORDER', 'CLEANING'],
  OCCUPIED: ['AVAILABLE', 'CLEANING'],
  RESERVED: ['OCCUPIED', 'AVAILABLE', 'CLEANING'],
  CLEANING: ['AVAILABLE', 'OUT_OF_ORDER'],
  OUT_OF_ORDER: ['AVAILABLE', 'CLEANING'],
};

function validationError(res: any, err: z.ZodError) {
  return res.status(400).json({ success: false, error: err.errors.map((e) => e.message).join(', ') });
}

function roomFor(restaurantId: string) {
  return `restaurant:${restaurantId}`;
}

function tableRoom(tableId: string) {
  return `table:${tableId}`;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const createTableSchema = z.object({
  number: z.string().min(1).max(20).optional(),
  label: z.string().min(1).max(20).optional(),
  capacity: z.coerce.number().int().min(1).max(100).optional().default(4),
  location: z.string().max(100).optional().nullable(),
  status: z.enum(TABLE_STATUSES).optional().default('AVAILABLE'),
  isActive: z.boolean().optional().default(true),
  restaurantId: z.string().min(1).optional(),
});

const updateTableSchema = z.object({
  number: z.string().min(1).max(20).optional(),
  capacity: z.coerce.number().int().min(1).max(100).optional(),
  location: z.string().max(100).optional().nullable(),
  isActive: z.boolean().optional(),
});

const statusSchema = z.object({
  status: z.enum(TABLE_STATUSES),
});

const createSessionSchema = z.object({
  partySize: z.coerce.number().int().min(1).max(100).optional(),
  customerId: z.string().optional(),
});

// ===========================================================================
//  QR — RESOLVE (public, no auth) — must be BEFORE /:id routes
// ===========================================================================
router.get('/qr/:token', async (req, res) => {
  try {
    const qr = await prisma.tableQrCode.findUnique({
      where: { token: req.params.token },
      include: { table: { include: { restaurant: true } } },
    });
    if (!qr || !qr.isActive) return res.status(404).json({ success: false, error: 'QR code not found or inactive' });
    if (!qr.table.isActive) return res.status(410).json({ success: false, error: 'Table is inactive' });

    return res.json({
      success: true,
      data: {
        token: qr.token,
        table: qr.table,
        restaurant: qr.table.restaurant,
      },
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to resolve QR code' });
  }
});

// Deactivate a QR token (staff only)
router.patch('/qr/:token/deactivate', auth, authorize('WAITER', 'MANAGER', 'ADMIN', 'CASHIER'), async (req: AuthRequest, res) => {
  try {
    const qr = await prisma.tableQrCode.findUnique({ where: { token: req.params.token } });
    if (!qr) return res.status(404).json({ success: false, error: 'QR code not found' });

    const updated = await prisma.tableQrCode.update({
      where: { token: req.params.token },
      data: { isActive: false },
    });

    await audit(req.user!.id, 'DEACTIVATE_QR', 'TableQrCode', updated.id, { token: req.params.token });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to deactivate QR code' });
  }
});

// ===========================================================================
//  SESSIONS — independent routes (before /:id to avoid param collision)
// ===========================================================================

// GET /api/tables/sessions/:sessionId  — fetch single session with details
router.get('/sessions/:sessionId', auth, async (req, res) => {
  try {
    const session = await prisma.tableSession.findUnique({
      where: { id: req.params.sessionId },
      include: {
        table: true,
        customer: { include: { user: true } },
        orders: { include: { items: true } },
        bills: true,
      },
    });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    return res.json({ success: true, data: session });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch session' });
  }
});

// PATCH /api/tables/sessions/:sessionId/close — close active session
router.patch('/sessions/:sessionId/close', auth, async (req: AuthRequest, res) => {
  try {
    const session = await prisma.tableSession.findUnique({
      where: { id: req.params.sessionId },
      include: { table: true },
    });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.status !== 'ACTIVE') return res.status(409).json({ success: false, error: `Session already ${session.status}` });

    // Check for open orders/bills — allow close even with pending; optionally warn
    const closed = await prisma.tableSession.update({
      where: { id: session.id },
      data: { status: 'CLOSED', closedAt: new Date() },
      include: { table: true, customer: true },
    });

    // Release table — transition to CLEANING then AVAILABLE; for now set AVAILABLE
    // If table was OCCUPIED, move to AVAILABLE (or CLEANING if configured)
    if (session.table.status === 'OCCUPIED') {
      const updatedTable = await prisma.table.update({
        where: { id: session.tableId },
        data: { status: 'AVAILABLE' },
      });
      emitToRoom(roomFor(updatedTable.restaurantId), 'table:statusChanged', {
        tableId: updatedTable.id,
        restaurantId: updatedTable.restaurantId,
        status: updatedTable.status,
        table: updatedTable,
      });
      emit('table:updated', { tableId: updatedTable.id, status: updatedTable.status });
    }

    emitToRoom(roomFor(session.table.restaurantId), 'session:closed', { session: closed });
    emitToRoom(tableRoom(session.tableId), 'session:closed', { session: closed });

    await audit(req.user!.id, 'CLOSE_SESSION', 'TableSession', closed.id, { tableId: session.tableId });

    return res.json({ success: true, data: closed });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to close session' });
  }
});

// GET /api/tables/sessions — list sessions with filters
router.get('/sessions', auth, async (req, res) => {
  try {
    const { tableId, status, restaurantId } = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (tableId) where.tableId = tableId;
    if (status) where.status = status;
    if (restaurantId) where.table = { restaurantId };

    const sessions = await prisma.tableSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { table: true, customer: { include: { user: true } } },
    });
    return res.json({ success: true, data: sessions });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch sessions' });
  }
});

// ===========================================================================
//  TABLES CRUD
// ===========================================================================

// GET /api/tables?restaurantId=&status=&isActive=
router.get('/', async (req, res) => {
  try {
    const { restaurantId, status, isActive } = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (restaurantId) where.restaurantId = restaurantId;
    if (status) where.status = status;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const tables = await prisma.table.findMany({
      where,
      orderBy: [{ restaurantId: 'asc' }, { number: 'asc' }],
      include: {
        _count: { select: { sessions: true, reservations: true } },
        qrCodes: { where: { isActive: true }, select: { id: true, token: true, isActive: true, createdAt: true } },
      },
    });
    return res.json({ success: true, data: tables });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch tables' });
  }
});

// POST /api/tables  — create table
router.post('/', auth, authorize('MANAGER', 'ADMIN', 'WAITER'), async (req: AuthRequest, res) => {
  try {
    const parsed = createTableSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    let { restaurantId, number, capacity, location, status, isActive } = parsed.data as any;
    // alias: label -> number
    if (!number && (parsed.data as any).label) number = String((parsed.data as any).label);
    // auto-assign number if still missing (incremental)
    if (!restaurantId) {
      const def = await prisma.restaurant.findFirst();
      if (!def) return res.status(400).json({ success:false, error:'No restaurant configured' });
      restaurantId = def.id;
    }
    if (!number) {
      const count = await prisma.table.count({ where:{ restaurantId }});
      number = String(count + 1);
    }
    capacity = Number(capacity) || 4;

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) return res.status(400).json({ success: false, error: 'Restaurant not found' });

    const dupe = await prisma.table.findUnique({
      where: { restaurantId_number: { restaurantId, number } },
    } as any);
    // Prisma unique compound check — fallback to findFirst if compound unique name differs
    const existingByNumber = dupe ?? (await prisma.table.findFirst({ where: { restaurantId, number } }));
    if (existingByNumber) return res.status(409).json({ success: false, error: `Table number "${number}" already exists in this restaurant` });

    const table = await prisma.table.create({
      data: { restaurantId, number, capacity, location: location || null, status: status || 'AVAILABLE', isActive: isActive ?? true },
    });

    emitToRoom(roomFor(restaurantId), 'table:created', { table });
    emit('table:updated', { tableId: table.id, restaurantId, action: 'created' });

    await audit(req.user!.id, 'CREATE', 'Table', table.id, { number, capacity, restaurantId });

    return res.status(201).json({ success: true, data: table });
  } catch (err: any) {
    console.error(err);
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'Table number already exists' });
    return res.status(500).json({ success: false, error: 'Failed to create table' });
  }
});

// -- Per-table sub-routes (specific before generic :id) --

// GET /api/tables/:id/qr — list QR codes for table
router.get('/:id/qr', auth, async (req, res) => {
  try {
    const table = await prisma.table.findUnique({ where: { id: req.params.id } });
    if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

    const codes = await prisma.tableQrCode.findMany({
      where: { tableId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: codes });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch QR codes' });
  }
});

// POST /api/tables/:id/qr — generate new QR code
router.post('/:id/qr', auth, authorize('MANAGER', 'ADMIN', 'WAITER'), async (req: AuthRequest, res) => {
  try {
    const table = await prisma.table.findUnique({
      where: { id: req.params.id },
      include: { restaurant: true },
    });
    if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

    const token = nanoid(16);

    const qr = await prisma.tableQrCode.create({
      data: { token, tableId: table.id },
    });

    // Build URL that QR should encode — frontend deep link
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const qrUrl = `${baseUrl.replace(/\/$/, '')}/qr/${token}`;

    let dataUrl: string | null = null;
    try {
      dataUrl = await QRCode.toDataURL(qrUrl, { width: 400, margin: 2 });
    } catch (e) {
      console.warn('QRCode.toDataURL failed', e);
    }

    emitToRoom(roomFor(table.restaurantId), 'table:qrGenerated', {
      tableId: table.id,
      qr: { ...qr, qrUrl, dataUrl },
    });

    await audit(req.user!.id, 'GENERATE_QR', 'TableQrCode', qr.id, { tableId: table.id, token });

    return res.status(201).json({ success: true, data: { ...qr, qrUrl, dataUrl } });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to generate QR code' });
  }
});

// GET /api/tables/:id/sessions — sessions for a table
router.get('/:id/sessions', auth, async (req, res) => {
  try {
    const table = await prisma.table.findUnique({ where: { id: req.params.id } });
    if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

    const sessions = await prisma.tableSession.findMany({
      where: { tableId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: { customer: { include: { user: true } }, orders: true, bills: true },
    });
    return res.json({ success: true, data: sessions });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch table sessions' });
  }
});

// POST /api/tables/:id/sessions — start new session (occupy table)
router.post('/:id/sessions', auth, async (req: AuthRequest, res) => {
  try {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const table = await prisma.table.findUnique({ where: { id: req.params.id } });
    if (!table) return res.status(404).json({ success: false, error: 'Table not found' });
    if (!table.isActive) return res.status(409).json({ success: false, error: 'Table is inactive' });

    // Prevent double active session per table
    const activeSession = await prisma.tableSession.findFirst({
      where: { tableId: req.params.id, status: 'ACTIVE' },
    });
    if (activeSession) return res.status(409).json({ success: false, error: 'Table already has an active session', data: activeSession });

    // Resolve customerId: explicit or via authenticated user
    let customerId: string | null = parsed.data.customerId || null;
    if (!customerId && req.user) {
      const customer = await prisma.customer.findUnique({ where: { userId: req.user.id } });
      if (customer) customerId = customer.id;
    }
    if (customerId) {
      const c = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!c) return res.status(400).json({ success: false, error: 'Invalid customerId' });
    }

    const session = await prisma.tableSession.create({
      data: {
        tableId: table.id,
        customerId,
        partySize: parsed.data.partySize ?? null,
        status: 'ACTIVE',
      },
      include: { table: true, customer: { include: { user: true } } },
    });

    // Mark table as OCCUPIED
    const updatedTable = await prisma.table.update({
      where: { id: table.id },
      data: { status: 'OCCUPIED' },
    });

    emitToRoom(roomFor(table.restaurantId), 'table:statusChanged', {
      tableId: table.id,
      restaurantId: table.restaurantId,
      status: updatedTable.status,
      table: updatedTable,
    });
    emitToRoom(roomFor(table.restaurantId), 'session:created', { session });
    emitToRoom(tableRoom(table.id), 'session:created', { session });
    emit('table:updated', { tableId: table.id, status: updatedTable.status });

    await audit(req.user!.id, 'CREATE_SESSION', 'TableSession', session.id, { tableId: table.id, partySize: parsed.data.partySize });

    return res.status(201).json({ success: true, data: session });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to create session' });
  }
});

// PATCH /api/tables/:id/status — transition status with validation + socket emit
router.patch('/:id/status', auth, authorize('WAITER', 'MANAGER', 'ADMIN', 'CASHIER'), async (req: AuthRequest, res) => {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const table = await prisma.table.findUnique({ where: { id: req.params.id } });
    if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

    const from = table.status;
    const to = parsed.data.status;

    if (from === to) return res.json({ success: true, data: table });

    // Enforce allowed transitions (allow ADMIN to override)
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to) && req.user?.role !== 'ADMIN') {
      return res.status(409).json({
        success: false,
        error: `Transition ${from} -> ${to} not allowed. Allowed: ${allowed.join(', ') || 'none'}`,
      });
    }

    // Guard: cannot occupy if active session exists differently — but allow OCCUPIED without session for walk-in
    // Guard: cannot set AVAILABLE if there is still an ACTIVE session
    if (to === 'AVAILABLE') {
      const active = await prisma.tableSession.findFirst({ where: { tableId: table.id, status: 'ACTIVE' } });
      if (active) return res.status(409).json({ success: false, error: 'Close active session before marking table AVAILABLE' });
    }

    const updated = await prisma.table.update({
      where: { id: table.id },
      data: { status: to },
    });

    // Auto-close stale sessions if moving to CLEANING/OUT_OF_ORDER — no, keep sessions until explicitly closed

    emitToRoom(roomFor(updated.restaurantId), 'table:statusChanged', {
      tableId: updated.id,
      restaurantId: updated.restaurantId,
      from,
      to,
      status: updated.status,
      table: updated,
    });
    emitToRoom(tableRoom(updated.id), 'table:statusChanged', { from, to, table: updated });
    emit('table:updated', { tableId: updated.id, restaurantId: updated.restaurantId, status: updated.status });

    await audit(req.user!.id, 'TABLE_STATUS', 'Table', updated.id, { from, to });

    return res.json({ success: true, data: updated });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to update table status' });
  }
});

// GET /api/tables/:id — single table
router.get('/:id', async (req, res) => {
  try {
    const table = await prisma.table.findUnique({
      where: { id: req.params.id },
      include: {
        restaurant: true,
        qrCodes: { orderBy: { createdAt: 'desc' } },
        sessions: { orderBy: { createdAt: 'desc' }, take: 10, include: { customer: { include: { user: true } } } },
        reservations: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!table) return res.status(404).json({ success: false, error: 'Table not found' });
    return res.json({ success: true, data: table });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch table' });
  }
});

// PATCH /api/tables/:id — update table metadata
router.patch('/:id', auth, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const parsed = updateTableSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const existing = await prisma.table.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Table not found' });

    // If number change, ensure uniqueness
    if (parsed.data.number && parsed.data.number !== existing.number) {
      const dupe = await prisma.table.findFirst({
        where: { restaurantId: existing.restaurantId, number: parsed.data.number, id: { not: existing.id } },
      });
      if (dupe) return res.status(409).json({ success: false, error: `Table number "${parsed.data.number}" already exists` });
    }

    const updated = await prisma.table.update({
      where: { id: req.params.id },
      data: parsed.data as any,
    });

    emitToRoom(roomFor(updated.restaurantId), 'table:updated', { table: updated });
    emit('table:updated', { tableId: updated.id, restaurantId: updated.restaurantId, action: 'updated' });

    await audit(req.user!.id, 'UPDATE', 'Table', updated.id, parsed.data);

    return res.json({ success: true, data: updated });
  } catch (err: any) {
    console.error(err);
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'Table number already exists' });
    return res.status(500).json({ success: false, error: 'Failed to update table' });
  }
});

// DELETE /api/tables/:id — soft delete (isActive=false) or hard delete if no sessions
router.delete('/:id', auth, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.table.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { sessions: true, reservations: true } } },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Table not found' });

    const activeSession = await prisma.tableSession.findFirst({
      where: { tableId: req.params.id, status: 'ACTIVE' },
    });
    if (activeSession) return res.status(409).json({ success: false, error: 'Cannot delete table with active session' });

    // If table has history, soft-delete
    if (existing._count.sessions > 0 || existing._count.reservations > 0) {
      const soft = await prisma.table.update({
        where: { id: req.params.id },
        data: { isActive: false, status: 'OUT_OF_ORDER' },
      });
      emitToRoom(roomFor(soft.restaurantId), 'table:deleted', { tableId: soft.id, soft: true });
      await audit(req.user!.id, 'SOFT_DELETE', 'Table', soft.id, {});
      return res.json({ success: true, data: { id: soft.id, soft: true } });
    }

    await prisma.table.delete({ where: { id: req.params.id } });
    emitToRoom(roomFor(existing.restaurantId), 'table:deleted', { tableId: req.params.id });
    emit('table:updated', { tableId: req.params.id, action: 'deleted' });

    await audit(req.user!.id, 'DELETE', 'Table', req.params.id, {});

    return res.json({ success: true, data: { id: req.params.id } });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to delete table' });
  }
});


// Alias: PUT /:id  (frontend compatibility)
router.put('/:id', auth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const body: any = req.body;
    // if status provided, delegate to status transition (no strict check)
    if (body.status) {
      const table = await prisma.table.findUnique({ where:{ id }});
      if (!table) return res.status(404).json({ success:false, error:'Table not found'});
      const updated = await prisma.table.update({ where:{ id }, data:{ status: body.status }});
      return res.json({ success:true, data: updated });
    }
    const updated = await prisma.table.update({ where:{ id }, data:{
      ...(body.number?{ number: String(body.number)}:{}),
      ...(body.label?{ number: String(body.label)}:{}),
      ...(body.capacity?{ capacity: Number(body.capacity)}:{}),
      ...(body.location!==undefined?{ location: body.location}:{}),
    }});
    res.json({ success:true, data: updated });
  } catch(e:any){ res.status(500).json({ success:false, error: e.message }); }
});

export default router;
