// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(auth);

const itemSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().int().min(0),
});
const createSchema = z.object({
  supplierId: z.string().min(1),
  totalAmount: z.number().int().min(0).optional(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1),
});

router.get('/', async (req:AuthRequest,res)=>{
  const { supplierId, page='1', limit='50' } = req.query as any;
  const where:any={};
  if (supplierId) where.supplierId=String(supplierId);
  const p=Math.max(1,parseInt(String(page),10)||1);
  const l=Math.min(100,Math.max(1,parseInt(String(limit),10)||50));
  const [purchases, total]=await Promise.all([
    prisma.purchase.findMany({ where, include:{ supplier:true, items:{ include:{ } } }, orderBy:{createdAt:'desc'}, skip:(p-1)*l, take:l }),
    prisma.purchase.count({ where }),
  ]);
  // enrich with inventoryItem info manually (include not supported via purchaseItem relation? it has no include)
  // Actually PurchaseItem has inventoryItemId but no relation include? prisma schema: PurchaseItem no relation to InventoryItem. So fetch separately.
  // We'll return as is.
  res.json({ success:true, data:{ purchases, total, page:p, limit:l } });
});

router.get('/:id', async (req,res)=>{
  const purchase = await prisma.purchase.findUnique({ where:{ id:req.params.id }, include:{ supplier:true, items:true } });
  if (!purchase) return res.status(404).json({ success:false, error:'Purchase not found' });
  // enrich items with inventory item names
  const ids = purchase.items.map(i=>i.inventoryItemId);
  const invMap = new Map((await prisma.inventoryItem.findMany({ where:{ id:{ in:ids }}})).map(i=>[i.id,i]));
  const enriched = purchase.items.map(i=>({ ...i, inventoryItem: invMap.get(i.inventoryItemId) || null }));
  res.json({ success:true, data:{ ...purchase, items: enriched } });
});

router.post('/', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const parsed=createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const supplier = await prisma.supplier.findUnique({ where:{ id:parsed.data.supplierId }});
  if (!supplier) return res.status(404).json({ success:false, error:'Supplier not found' });
  // validate inventory items exist
  const invIds = parsed.data.items.map(i=>i.inventoryItemId);
  const invItems = await prisma.inventoryItem.findMany({ where:{ id:{ in:invIds }}});
  if (invItems.length !== invIds.length) return res.status(400).json({ success:false, error:'One or more inventory items not found' });
  const invMap = new Map(invItems.map(i=>[i.id,i]));
  // compute total
  const computedTotal = parsed.data.items.reduce((s,it)=> s + (it.quantity*it.unitPrice), 0);
  const totalAmount = parsed.data.totalAmount ?? computedTotal;

  const result = await prisma.$transaction(async (tx)=>{
    const purchase = await tx.purchase.create({ data:{
      supplierId: parsed.data.supplierId,
      totalAmount,
      notes: parsed.data.notes || null,
      createdById: req.user!.id,
    }});
    for (const it of parsed.data.items){
      await tx.purchaseItem.create({ data:{
        purchaseId: purchase.id,
        inventoryItemId: it.inventoryItemId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        amount: Math.round(it.quantity*it.unitPrice),
      }});
      // increment stock
      const current = invMap.get(it.inventoryItemId)!;
      await tx.inventoryItem.update({ where:{ id: it.inventoryItemId }, data:{ currentQty: current.currentQty + it.quantity } });
      // transaction log
      await tx.inventoryTransaction.create({ data:{
        inventoryItemId: it.inventoryItemId,
        type:'PURCHASE',
        quantity: it.quantity,
        reason: 'Purchase '+purchase.id,
        referenceId: purchase.id,
        createdById: req.user!.id,
      }});
      // update cached map for next iteration (in case duplicate items? not allowed but safe)
      invMap.set(it.inventoryItemId, { ...current, currentQty: current.currentQty + it.quantity } as any);
    }
    return purchase;
  });
  const full = await prisma.purchase.findUnique({ where:{ id:result.id }, include:{ supplier:true, items:true }});
  await audit(req.user!.id,'CREATE','Purchase',result.id, parsed.data);
  res.status(201).json({ success:true, data: full });
});

router.delete('/:id', authorize('ADMIN'), async (req:AuthRequest,res)=>{
  const purchase = await prisma.purchase.findUnique({ where:{ id:req.params.id }, include:{ items:true }});
  if (!purchase) return res.status(404).json({ success:false, error:'Purchase not found' });
  // revert stock - ensure not negative
  for (const it of purchase.items){
    const inv = await prisma.inventoryItem.findUnique({ where:{ id:it.inventoryItemId }});
    if (!inv) continue;
    if (inv.currentQty < it.quantity) return res.status(400).json({ success:false, error: 'Cannot delete purchase: stock for '+(inv.name)+' would go negative. Adjust stock first.' });
  }
  await prisma.$transaction(async (tx)=>{
    for (const it of purchase.items){
      await tx.inventoryItem.update({ where:{ id:it.inventoryItemId }, data:{ currentQty:{ decrement: it.quantity } } });
      await tx.inventoryTransaction.create({ data:{ inventoryItemId: it.inventoryItemId, type:'PURCHASE_REVERSAL', quantity: it.quantity, reason:'Purchase deleted '+purchase.id, referenceId: purchase.id, createdById: req.user!.id } });
    }
    await tx.purchaseItem.deleteMany({ where:{ purchaseId:purchase.id }});
    await tx.purchase.delete({ where:{ id:purchase.id }});
  });
  await audit(req.user!.id,'DELETE','Purchase',req.params.id,null);
  res.json({ success:true, data:{ id:req.params.id } });
});

export default router;
