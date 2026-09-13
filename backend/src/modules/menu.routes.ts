// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { emit } from '../lib/socket.js';

const router = Router();

// ---- helpers ----
function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ---- Zod schemas ----
const categoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  restaurantId: z.string().min(1),
});

const categoryUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const itemCreateSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().max(1000).optional(),
  price: z.number().int().min(0),
  taxPercent: z.number().int().min(0).max(100).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  veg: z.boolean().optional(),
  prepTimeMin: z.number().int().min(1).optional(),
  isAvailable: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  categoryId: z.string().min(1),
  restaurantId: z.string().min(1),
});

const itemUpdateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(1000).optional().nullable(),
  price: z.number().int().min(0).optional(),
  taxPercent: z.number().int().min(0).max(100).optional(),
  imageUrl: z.string().url().optional().nullable(),
  veg: z.boolean().optional(),
  prepTimeMin: z.number().int().min(1).optional(),
  isAvailable: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  categoryId: z.string().min(1).optional(),
});

// ====================== CATEGORIES ======================

// GET /categories?restaurantId=xxx
router.get('/categories', async (req, res, next) => {
  try {
    let { restaurantId } = req.query as { restaurantId?: string };
    if (!restaurantId) { const _r = await prisma.restaurant.findFirst(); restaurantId = _r?.id; if(!restaurantId) return res.json({ success:true, data:[] }); }
    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
    res.json({ success: true, data: categories });
  } catch (e) { next(e); }
});

// POST /categories
router.post('/categories', auth, authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = categoryCreateSchema.parse(req.body);
    const slug = parsed.slug ? slugify(parsed.slug) : slugify(parsed.name);

    const existing = await prisma.menuCategory.findUnique({ where: { slug } });
    if (existing) return res.status(409).json({ success: false, error: 'Slug already exists' });

    // restaurant existence check
    const restaurant = await prisma.restaurant.findUnique({ where: { id: parsed.restaurantId } });
    if (!restaurant) return res.status(404).json({ success: false, error: 'Restaurant not found' });

    const category = await prisma.menuCategory.create({
      data: {
        name: parsed.name,
        slug,
        sortOrder: parsed.sortOrder ?? 0,
        restaurantId: parsed.restaurantId,
      },
    });
    await audit(req.user?.id ?? null, 'CREATE', 'MenuCategory', category.id, { name: category.name });
    emit('menu:category:created', category);
    res.status(201).json({ success: true, data: category });
  } catch (e) { next(e); }
});

// PUT /categories/:id
router.put('/categories/:id', auth, authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = categoryUpdateSchema.parse(req.body);
    const id = (req.params as any).id as string;

    const existing = await prisma.menuCategory.findUnique({ where: { id: id as string } });
    if (!existing) return res.status(404).json({ success: false, error: 'Category not found' });

    let slug: string | undefined;
    if (parsed.slug) slug = slugify(parsed.slug);
    else if (parsed.name) slug = slugify(parsed.name);

    if (slug && slug !== existing.slug) {
      const clash = await prisma.menuCategory.findUnique({ where: { slug } });
      if (clash) return res.status(409).json({ success: false, error: 'Slug already exists' });
    }

    const updated = await prisma.menuCategory.update({
      where: { id: id as string },
      data: {
        name: parsed.name,
        slug: slug ?? undefined,
        sortOrder: parsed.sortOrder,
      },
    });
    await audit(req.user?.id ?? null, 'UPDATE', 'MenuCategory', id, parsed);
    emit('menu:category:updated', updated);
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// DELETE /categories/:id
router.delete('/categories/:id', auth, authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const id = (req.params as any).id as string;
    const existing = await prisma.menuCategory.findUnique({ where: { id: id as string }, include: { _count: { select: { items: true } } } });
    if (!existing) return res.status(404).json({ success: false, error: 'Category not found' });
    if (existing._count.items > 0) return res.status(400).json({ success: false, error: 'Category has items, move or delete them first' });

    await prisma.menuCategory.delete({ where: { id: id as string } });
    await audit(req.user?.id ?? null, 'DELETE', 'MenuCategory', id, {});
    emit('menu:category:deleted', { id });
    res.json({ success: true, message: 'Category deleted' });
  } catch (e) { next(e); }
});

// ====================== ITEMS ======================

// GET /items?restaurantId=xxx&categoryId=xxx&isAvailable=true&q=search&featured=true
router.get('/items', async (req, res, next) => {
  try {
    let _q = req.query as Record<string, string | undefined>;
    let { restaurantId, categoryId, isAvailable, q, featured, isFeatured } = _q;
    if (!restaurantId) { const _r = await prisma.restaurant.findFirst(); restaurantId = _r?.id as string; if(!restaurantId) return res.json({ success:true, data:[] }); }

    const where: any = { restaurantId };
    if (categoryId) where.categoryId = categoryId;
    if (isAvailable !== undefined) where.isAvailable = isAvailable === 'true';
    if (featured === 'true' || isFeatured === 'true') where.isFeatured = true;
    if (q) where.name = { contains: q, mode: 'insensitive' };

    const items = await prisma.menuItem.findMany({
      where,
      include: { category: true, recipe: { include: { ingredients: { include: { inventoryItem: true } } } } },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

// GET /items/:id
router.get('/items/:id', async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findUnique({
      where: { id: (req.params.id as string) },
      include: { category: true, recipe: { include: { ingredients: { include: { inventoryItem: true } } } } },
    });
    if (!item) return res.status(404).json({ success: false, error: 'Menu item not found' });
    res.json({ success: true, data: item });
  } catch (e) { next(e); }
});

// POST /items
router.post('/items', auth, authorize('ADMIN', 'MANAGER', 'CHEF'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = itemCreateSchema.parse(req.body);

    const [category, restaurant] = await Promise.all([
      prisma.menuCategory.findUnique({ where: { id: parsed.categoryId } }),
      prisma.restaurant.findUnique({ where: { id: parsed.restaurantId } }),
    ]);
    if (!restaurant) return res.status(404).json({ success: false, error: 'Restaurant not found' });
    if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
    if (category.restaurantId !== parsed.restaurantId) return res.status(400).json({ success: false, error: 'Category does not belong to restaurant' });

    const item = await prisma.menuItem.create({
      data: {
        name: parsed.name,
        description: parsed.description || null,
        price: parsed.price,
        taxPercent: parsed.taxPercent ?? 0,
        imageUrl: parsed.imageUrl || null,
        veg: parsed.veg ?? true,
        prepTimeMin: parsed.prepTimeMin ?? 15,
        isAvailable: parsed.isAvailable ?? true,
        isFeatured: parsed.isFeatured ?? false,
        categoryId: parsed.categoryId,
        restaurantId: parsed.restaurantId,
      },
      include: { category: true },
    });
    await audit(req.user?.id ?? null, 'CREATE', 'MenuItem', item.id, { name: item.name, price: item.price });
    emit('menu:item:created', item);
    res.status(201).json({ success: true, data: item });
  } catch (e) { next(e); }
});

// PUT /items/:id
router.put('/items/:id', auth, authorize('ADMIN', 'MANAGER', 'CHEF'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = itemUpdateSchema.parse(req.body);
    const id = (req.params as any).id as string;
    const existing = await prisma.menuItem.findUnique({ where: { id: id as string } });
    if (!existing) return res.status(404).json({ success: false, error: 'Menu item not found' });

    if (parsed.categoryId) {
      const cat = await prisma.menuCategory.findUnique({ where: { id: parsed.categoryId } });
      if (!cat) return res.status(404).json({ success: false, error: 'Category not found' });
      if (cat.restaurantId !== existing.restaurantId) return res.status(400).json({ success: false, error: 'Category restaurant mismatch' });
    }

    const data: any = { ...parsed };
    if ('description' in parsed) data.description = parsed.description ?? null;
    if ('imageUrl' in parsed) data.imageUrl = parsed.imageUrl ?? null;

    const updated = await prisma.menuItem.update({ where: { id: id as string }, data, include: { category: true } });
    await audit(req.user?.id ?? null, 'UPDATE', 'MenuItem', id, parsed);
    emit('menu:item:updated', updated);
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// DELETE /items/:id
router.delete('/items/:id', auth, authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const id = (req.params as any).id as string;
    const existing = await prisma.menuItem.findUnique({ where: { id: id as string } });
    if (!existing) return res.status(404).json({ success: false, error: 'Menu item not found' });
    await prisma.menuItem.delete({ where: { id: id as string } });
    await audit(req.user?.id ?? null, 'DELETE', 'MenuItem', id, {});
    emit('menu:item:deleted', { id });
    res.json({ success: true, message: 'Menu item deleted' });
  } catch (e) { next(e); }
});

// PATCH /items/:id/availability - quick toggle
router.patch('/items/:id/availability', auth, authorize('ADMIN', 'MANAGER', 'CHEF', 'WAITER'), async (req: AuthRequest, res, next) => {
  try {
    const { isAvailable } = z.object({ isAvailable: z.boolean() }).parse(req.body);
    const id = (req.params as any).id as string;
    const existing = await prisma.menuItem.findUnique({ where: { id: id as string } });
    if (!existing) return res.status(404).json({ success: false, error: 'Menu item not found' });
    const updated = await prisma.menuItem.update({ where: { id: id as string }, data: { isAvailable } });
    await audit(req.user?.id ?? null, 'UPDATE_AVAILABILITY', 'MenuItem', id, { isAvailable });
    emit('menu:item:availability', { id, isAvailable });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

export default router;
