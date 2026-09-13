import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { emit } from '../lib/socket.js';

const router = Router();

const ingredientSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.number().positive().max(100000),
});

const recipeUpsertSchema = z.object({
  ingredients: z.array(ingredientSchema).min(1).max(50),
});

// GET /recipes/:menuItemId
router.get('/:menuItemId', async (req, res, next) => {
  try {
    const menuItemId = (req.params as any).menuItemId as string;
    const recipe = await prisma.recipe.findUnique({
      where: { menuItemId: menuItemId as string },
      include: {
        ingredients: { include: { inventoryItem: true } },
        menuItem: { include: { category: true } },
      },
    });
    if (!recipe) return res.status(404).json({ success: false, error: 'Recipe not found' });
    res.json({ success: true, data: recipe });
  } catch (e) { next(e); }
});

// GET /recipes - list all with ingredients (filter by restaurantId)
router.get('/', async (req, res, next) => {
  try {
    const { restaurantId } = req.query as { restaurantId?: string };
    const where: any = {};
    if (restaurantId) where.menuItem = { restaurantId };
    const recipes = await prisma.recipe.findMany({
      where,
      include: { ingredients: { include: { inventoryItem: true } }, menuItem: true },
    });
    res.json({ success: true, data: recipes });
  } catch (e) { next(e); }
});

// PUT /recipes/:menuItemId - upsert (create or replace)
router.put('/:menuItemId', auth, authorize('ADMIN', 'MANAGER', 'CHEF'), async (req: AuthRequest, res, next) => {
  try {
    const menuItemId = (req.params as any).menuItemId as string;
    const parsed = recipeUpsertSchema.parse(req.body);

    const menuItem = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
    if (!menuItem) return res.status(404).json({ success: false, error: 'MenuItem not found' });

    // Validate all inventory items exist and belong to same restaurant
    const inventoryIds = parsed.ingredients.map(i => i.inventoryItemId);
    const invItems = await prisma.inventoryItem.findMany({ where: { id: { in: inventoryIds } } });
    if (invItems.length !== inventoryIds.length) {
      const found = new Set(invItems.map(i => i.id));
      const missing = inventoryIds.filter(id => !found.has(id));
      return res.status(400).json({ success: false, error: `Inventory items not found: ${missing.join(', ')}` });
    }
    const wrongRestaurant = invItems.filter(i => i.restaurantId !== menuItem.restaurantId);
    if (wrongRestaurant.length > 0) {
      return res.status(400).json({ success: false, error: 'Inventory items must belong to same restaurant as menu item' });
    }

    // Unique ingredients check
    const dup = new Set(inventoryIds);
    if (dup.size !== inventoryIds.length) return res.status(400).json({ success: false, error: 'Duplicate inventory items in recipe' });

    const recipe = await prisma.$transaction(async (tx) => {
      let r = await tx.recipe.findUnique({ where: { menuItemId: menuItemId as string } });
      if (!r) {
        r = await tx.recipe.create({ data: { menuItemId } });
      }
      // Replace all ingredients atomically
      await tx.recipeIngredient.deleteMany({ where: { recipeId: r.id } });
      await tx.recipeIngredient.createMany({
        data: parsed.ingredients.map(i => ({
          recipeId: r!.id,
          inventoryItemId: i.inventoryItemId,
          quantity: i.quantity,
        })),
      });
      return tx.recipe.findUnique({
        where: { id: r.id },
        include: { ingredients: { include: { inventoryItem: true } }, menuItem: true },
      });
    });

    await audit(req.user?.id ?? null, 'UPSERT', 'Recipe', recipe!.id, { menuItemId, ingredients: parsed.ingredients });
    emit('recipe:upserted', recipe);
    res.json({ success: true, data: recipe });
  } catch (e) { next(e); }
});

// DELETE /recipes/:menuItemId
router.delete('/:menuItemId', auth, authorize('ADMIN', 'MANAGER', 'CHEF'), async (req: AuthRequest, res, next) => {
  try {
    const menuItemId = (req.params as any).menuItemId as string;
    const recipe = await prisma.recipe.findUnique({ where: { menuItemId: menuItemId as string } });
    if (!recipe) return res.status(404).json({ success: false, error: 'Recipe not found' });
    await prisma.recipe.delete({ where: { id: recipe.id } });
    await audit(req.user?.id ?? null, 'DELETE', 'Recipe', recipe.id, { menuItemId });
    emit('recipe:deleted', { menuItemId, id: recipe.id });
    res.json({ success: true, message: 'Recipe deleted' });
  } catch (e) { next(e); }
});

export default router;
