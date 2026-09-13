// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(150),
  address: z.string().max(300).optional(),
  phone: z.string().max(30).optional(),
  currency: z.string().max(10).optional().default('INR'),
  timezone: z.string().max(50).optional().default('Asia/Kolkata'),
  openTime: z.string().regex(/^\d{2}:\d{2}$/, 'openTime must be HH:MM').optional().default('09:00'),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, 'closeTime must be HH:MM').optional().default('22:00'),
});

const updateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  currency: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

function validationError(res: any, err: z.ZodError) {
  return res.status(400).json({ success: false, error: err.errors.map((e) => e.message).join(', ') });
}

// GET /api/restaurants
router.get('/', async (_req, res) => {
  try {
    const restaurants = await prisma.restaurant.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json({ success: true, data: restaurants });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch restaurants' });
  }
});

// GET /api/restaurants/:id
router.get('/:id', async (req, res) => {
  try {
    const id = String((req.params as any).id);
    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      include: { _count: { select: { tables: true, users: true } } } as any,
    });
    if (!restaurant) return res.status(404).json({ success: false, error: 'Restaurant not found' });
    return res.json({ success: true, data: restaurant });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch restaurant' });
  }
});

// POST /api/restaurants  (MANAGER, ADMIN)
router.post('/', auth, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const restaurant = await prisma.restaurant.create({ data: parsed.data });
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (user && !(user as any).restaurantId) {
        await prisma.user.update({ where: { id: user.id }, data: { restaurantId: restaurant.id } });
      }
    } catch {}
    await audit(req.user!.id, 'CREATE', 'Restaurant', restaurant.id, { name: restaurant.name });
    return res.status(201).json({ success: true, data: restaurant });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to create restaurant' });
  }
});

// PATCH /api/restaurants/:id  (MANAGER, ADMIN)
router.patch('/:id', auth, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const id = String((req.params as any).id);
    const existing = await prisma.restaurant.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Restaurant not found' });
    const restaurant = await prisma.restaurant.update({ where: { id }, data: parsed.data as any });
    await audit(req.user!.id, 'UPDATE', 'Restaurant', restaurant.id, parsed.data);
    return res.json({ success: true, data: restaurant });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to update restaurant' });
  }
});

// DELETE /api/restaurants/:id  (ADMIN only)
router.delete('/:id', auth, authorize('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const id = String((req.params as any).id);
    const existing = await prisma.restaurant.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Restaurant not found' });
    const activeTables = await prisma.table.count({ where: { restaurantId: id, isActive: true } });
    if (activeTables > 0) return res.status(409).json({ success: false, error: 'Cannot delete restaurant with active tables' });
    await prisma.restaurant.delete({ where: { id } });
    await audit(req.user!.id, 'DELETE', 'Restaurant', id, {});
    return res.json({ success: true, data: { id } });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to delete restaurant' });
  }
});

export default router;
