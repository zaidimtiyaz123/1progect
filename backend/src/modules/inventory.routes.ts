// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(auth);

async function resolveRestaurantId(req: AuthRequest, fallback?: string): Promise<string | null> {
  if (fallback) return fallback;
  if ((req.query as any).restaurantId) return String((req.query as any).restaurantId);
  // try user restaurant
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { restaurantId: true } });
  if (u?.restaurantId) return u.restaurantId;
  const r = await prisma.restaurant.findFirst({ select: { id: true } });
  return r?.id ?? null;
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  unit: z.string().min(1).max(20),
  currentQty: z.number().min(0).default(0),
  minQty: z.number().min(0).default(5),
  purchasePrice: z.number().int().min(0).default(0),
  supplierId: z.string().optional().nullable(),
  restaurantId: z.string().optional(),
});
const updateSchema = createSchema.partial();
const wastageSchema = z.object({ quantity: z.number().positive(), reason: z.string().optional() });
const adjustSchema = z.object({ quantity: z.number(), reason: z.string().optional(), type: z.string().optional() });

// GET /api/inventory/low-stock  (must be before /:id)
router.get('/low-stock', async (req: AuthRequest, res) => {
  const restaurantId = await resolveRestaurantId(req);
  if (!restaurantId) { const _r = await prisma.restaurant.findFirst(); restaurantId = _r?.id; if(!restaurantId) return res.json({ success:true, data:[] }); }
  const items = await prisma.inventoryItem.findMany({
    where: { restaurantId },
    include: { supplier: true },
  });
  const low = items.filter(i => i.currentQty <= i.minQty);
  res.json({ success: true, data: low });
});

// GET /api/inventory
router.get('/', async (req: AuthRequest, res) => {
  const restaurantId = await resolveRestaurantId(req);
  if (!restaurantId) { const _r = await prisma.restaurant.findFirst(); restaurantId = _r?.id; if(!restaurantId) return res.json({ success:true, data:[] }); }
  const { search, page = '1', limit = '50' } = req.query as any;
  const where: any = { restaurantId };
  if (search) where.name = { contains: String(search), mode: 'insensitive' } as any;
  // sqlite doesn't support mode insensitive, fallback to contains without mode
  if (search) where.name = { contains: String(search) };
  const p = Math.max(1, parseInt(String(page), 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({ where, include: { supplier: true }, orderBy: { createdAt: 'desc' }, skip: (p-1)*l, take: l }),
    prisma.inventoryItem.count({ where }),
  ]);
  res.json({ success: true, data: { items, total, page: p, limit: l } });
});

// GET /api/inventory/:id/transactions
router.get('/:id/transactions', async (req, res) => {
  const { id } = req.params;
  const { page='1', limit='50' } = req.query as any;
  const p = Math.max(1, parseInt(String(page),10)||1);
  const l = Math.min(100, Math.max(1, parseInt(String(limit),10)||50));
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ success:false, error:'Item not found' });
  const [txs, total] = await Promise.all([
    prisma.inventoryTransaction.findMany({ where:{ inventoryItemId:id }, orderBy:{ createdAt:'desc' }, skip:(p-1)*l, take:l }),
    prisma.inventoryTransaction.count({ where:{ inventoryItemId:id } }),
  ]);
  res.json({ success:true, data:{ transactions: txs, total, page:p, limit:l } });
});

// GET /api/inventory/:id
router.get('/:id', async (req,res)=>{
  const item = await prisma.inventoryItem.findUnique({ where:{ id:req.params.id }, include:{ supplier:true, transactions:{ orderBy:{createdAt:'desc'}, take:20 } } });
  if (!item) return res.status(404).json({ success:false, error:'Item not found' });
  res.json({ success:true, data:item });
});

// POST /api/inventory
router.post('/', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error: parsed.error.flatten() });
  const restaurantId = await resolveRestaurantId(req, parsed.data.restaurantId);
  if (!restaurantId) return res.status(400).json({ success:false, error:'restaurantId required' });
  try {
    const item = await prisma.inventoryItem.create({ data:{
      name: parsed.data.name,
      unit: parsed.data.unit,
      currentQty: parsed.data.currentQty ?? 0,
      minQty: parsed.data.minQty ?? 5,
      purchasePrice: parsed.data.purchasePrice ?? 0,
      supplierId: parsed.data.supplierId || null,
      restaurantId,
    }, include:{ supplier:true } });
    if ((parsed.data.currentQty ?? 0) > 0) {
      await prisma.inventoryTransaction.create({ data:{ inventoryItemId:item.id, type:'OPENING', quantity: parsed.data.currentQty ?? 0, reason:'Opening stock', createdById: req.user!.id } });
    }
    await audit(req.user!.id,'CREATE','InventoryItem',item.id, parsed.data);
    res.status(201).json({ success:true, data:item });
  } catch(e:any){
    if (e.code==='P2002') return res.status(409).json({ success:false, error:'Item with this name already exists in restaurant' });
    throw e;
  }
});

// PUT /api/inventory/:id
router.put('/:id', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const existing = await prisma.inventoryItem.findUnique({ where:{ id:req.params.id } });
  if (!existing) return res.status(404).json({ success:false, error:'Item not found' });
  const data:any={};
  if (parsed.data.name!==undefined) data.name=parsed.data.name;
  if (parsed.data.unit!==undefined) data.unit=parsed.data.unit;
  if (parsed.data.minQty!==undefined) data.minQty=parsed.data.minQty;
  if (parsed.data.purchasePrice!==undefined) data.purchasePrice=parsed.data.purchasePrice;
  if (parsed.data.supplierId!==undefined) data.supplierId=parsed.data.supplierId || null;
  if (parsed.data.restaurantId!==undefined) data.restaurantId=parsed.data.restaurantId;
  // currentQty direct update also logs transaction delta
  let qtyDelta: number| null = null;
  if (parsed.data.currentQty!==undefined) {
    qtyDelta = parsed.data.currentQty - existing.currentQty;
    data.currentQty = parsed.data.currentQty;
  }
  const item = await prisma.inventoryItem.update({ where:{ id:req.params.id }, data });
  if (qtyDelta!==null && qtyDelta!==0) {
    await prisma.inventoryTransaction.create({ data:{ inventoryItemId:item.id, type: qtyDelta>0?'ADJUSTMENT_IN':'ADJUSTMENT_OUT', quantity: Math.abs(qtyDelta), reason:'Manual qty update', createdById:req.user!.id } });
  }
  await audit(req.user!.id,'UPDATE','InventoryItem',item.id, parsed.data);
  res.json({ success:true, data:item });
});

// DELETE /api/inventory/:id
router.delete('/:id', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const existing = await prisma.inventoryItem.findUnique({ where:{ id:req.params.id } });
  if (!existing) return res.status(404).json({ success:false, error:'Item not found' });
  // prevent delete if used in recipes
  const used = await prisma.recipeIngredient.count({ where:{ inventoryItemId:req.params.id } });
  if (used>0) return res.status(400).json({ success:false, error:'Cannot delete item used in recipes' });
  await prisma.inventoryTransaction.deleteMany({ where:{ inventoryItemId:req.params.id } });
  await prisma.inventoryItem.delete({ where:{ id:req.params.id } });
  await audit(req.user!.id,'DELETE','InventoryItem',req.params.id,null);
  res.json({ success:true, data:{ id:req.params.id } });
});

// POST /api/inventory/:id/wastage
router.post('/:id/wastage', authorize('ADMIN','MANAGER','STAFF','CHEF'), async (req:AuthRequest,res)=>{
  const parsed = wastageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const item = await prisma.inventoryItem.findUnique({ where:{ id:req.params.id } });
  if (!item) return res.status(404).json({ success:false, error:'Item not found' });
  if (item.currentQty < parsed.data.quantity) return res.status(400).json({ success:false, error:'Insufficient stock for wastage' });
  const updated = await prisma.inventoryItem.update({ where:{ id:item.id }, data:{ currentQty: item.currentQty - parsed.data.quantity } });
  const tx = await prisma.inventoryTransaction.create({ data:{ inventoryItemId:item.id, type:'WASTAGE', quantity: parsed.data.quantity, reason: parsed.data.reason || 'Wastage', createdById:req.user!.id } });
  await audit(req.user!.id,'WASTAGE','InventoryItem',item.id, parsed.data);
  res.json({ success:true, data:{ item: updated, transaction: tx } });
});

// POST /api/inventory/:id/adjust  (generic +-)
router.post('/:id/adjust', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const item = await prisma.inventoryItem.findUnique({ where:{ id:req.params.id } });
  if (!item) return res.status(404).json({ success:false, error:'Item not found' });
  const newQty = item.currentQty + parsed.data.quantity;
  if (newQty < 0) return res.status(400).json({ success:false, error:'Adjustment would make stock negative' });
  const updated = await prisma.inventoryItem.update({ where:{ id:item.id }, data:{ currentQty:newQty } });
  const tx = await prisma.inventoryTransaction.create({ data:{ inventoryItemId:item.id, type: parsed.data.type || (parsed.data.quantity>=0?'ADJUSTMENT_IN':'ADJUSTMENT_OUT'), quantity: Math.abs(parsed.data.quantity), reason: parsed.data.reason || 'Adjustment', createdById:req.user!.id } });
  await audit(req.user!.id,'ADJUST','InventoryItem',item.id, parsed.data);
  res.json({ success:true, data:{ item:updated, transaction:tx } });
});

export default router;
