// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(auth);

async function resolveRestaurantId(req:AuthRequest, fallback?: string){
  if (fallback) return fallback;
  if ((req.query as any).restaurantId) return String((req.query as any).restaurantId);
  const u = await prisma.user.findUnique({ where:{ id:req.user!.id }, select:{ restaurantId:true } });
  if (u?.restaurantId) return u.restaurantId;
  const r = await prisma.restaurant.findFirst({ select:{ id:true } });
  return r?.id ?? null;
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  gstInfo: z.string().optional().nullable(),
  restaurantId: z.string().optional(),
});
const updateSchema = createSchema.partial();

router.get('/', async (req:AuthRequest,res)=>{
  const restaurantId = await resolveRestaurantId(req);
  if (!restaurantId) return res.status(400).json({ success:false, error:'restaurantId required' });
  const { search, page='1', limit='50' } = req.query as any;
  const where:any={ restaurantId };
  if (search) where.name={ contains:String(search) };
  const p=Math.max(1,parseInt(String(page),10)||1);
  const l=Math.min(100,Math.max(1,parseInt(String(limit),10)||50));
  const [suppliers, total]=await Promise.all([
    prisma.supplier.findMany({ where, include:{ _count:{ select:{ inventoryItems:true, purchases:true } } }, orderBy:{createdAt:'desc'}, skip:(p-1)*l, take:l }),
    prisma.supplier.count({ where }),
  ]);
  res.json({ success:true, data:{ suppliers, total, page:p, limit:l } });
});

router.get('/:id', async (req,res)=>{
  const s = await prisma.supplier.findUnique({ where:{ id:req.params.id }, include:{ inventoryItems:true, purchases:{ include:{ items:true }, orderBy:{createdAt:'desc'}, take:20 } } });
  if (!s) return res.status(404).json({ success:false, error:'Supplier not found' });
  res.json({ success:true, data:s });
});

router.post('/', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const parsed=createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const restaurantId=await resolveRestaurantId(req, parsed.data.restaurantId);
  if (!restaurantId) return res.status(400).json({ success:false, error:'restaurantId required' });
  const supplier=await prisma.supplier.create({ data:{ name:parsed.data.name, phone:parsed.data.phone||null, address:parsed.data.address||null, gstInfo:parsed.data.gstInfo||null, restaurantId } });
  await audit(req.user!.id,'CREATE','Supplier',supplier.id, parsed.data);
  res.status(201).json({ success:true, data:supplier });
});

router.put('/:id', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const parsed=updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const existing=await prisma.supplier.findUnique({ where:{ id:req.params.id }});
  if (!existing) return res.status(404).json({ success:false, error:'Supplier not found' });
  const data:any={};
  if (parsed.data.name!==undefined) data.name=parsed.data.name;
  if (parsed.data.phone!==undefined) data.phone=parsed.data.phone||null;
  if (parsed.data.address!==undefined) data.address=parsed.data.address||null;
  if (parsed.data.gstInfo!==undefined) data.gstInfo=parsed.data.gstInfo||null;
  if (parsed.data.restaurantId!==undefined) data.restaurantId=parsed.data.restaurantId;
  const supplier=await prisma.supplier.update({ where:{ id:req.params.id }, data });
  await audit(req.user!.id,'UPDATE','Supplier',supplier.id, parsed.data);
  res.json({ success:true, data:supplier });
});

router.delete('/:id', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const existing=await prisma.supplier.findUnique({ where:{ id:req.params.id }});
  if (!existing) return res.status(404).json({ success:false, error:'Supplier not found' });
  const purchases = await prisma.purchase.count({ where:{ supplierId:req.params.id }});
  if (purchases>0) return res.status(400).json({ success:false, error:'Cannot delete supplier with purchases. Archive instead.' });
  // unlink inventory items
  await prisma.inventoryItem.updateMany({ where:{ supplierId:req.params.id }, data:{ supplierId:null }});
  await prisma.supplier.delete({ where:{ id:req.params.id }});
  await audit(req.user!.id,'DELETE','Supplier',req.params.id,null);
  res.json({ success:true, data:{ id:req.params.id } });
});

export default router;
