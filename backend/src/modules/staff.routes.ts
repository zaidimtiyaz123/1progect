// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { hashPassword } from '../lib/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(auth);

// permissions as comma-separated string stored in Staff.permissions; also expose as array
const PERMS = ['ORDERS_VIEW','ORDERS_MANAGE','KITCHEN_VIEW','MENU_MANAGE','TABLES_MANAGE','INVENTORY_MANAGE','REPORTS_VIEW','STAFF_MANAGE','SETTINGS_MANAGE'] as const;

const createSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  phone: z.string().optional().nullable(),
  role: z.enum(['ADMIN','MANAGER','STAFF','CHEF','WAITER','CASHIER']).default('STAFF'),
  permissions: z.array(z.string()).optional().default([]),
  restaurantId: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});
const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  role: z.enum(['ADMIN','MANAGER','STAFF','CHEF','WAITER','CASHIER']).optional(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  restaurantId: z.string().optional().nullable(),
});
const permUpdateSchema = z.object({ permissions: z.array(z.string()).min(0) });

function permsToStr(perms:string[]){ return perms.join(','); }
function strToPerms(s:string){ return s ? s.split(',').filter(Boolean) : []; }

router.get('/', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const { role, search, page='1', limit='50' } = req.query as any;
  const where:any={};
  if (role) where.role=String(role);
  else where.role={ not:'CUSTOMER' };
  if (search){
    where.OR=[{ name:{ contains:String(search) }},{ email:{ contains:String(search) }}];
  }
  const p=Math.max(1,parseInt(String(page),10)||1);
  const l=Math.min(100,Math.max(1,parseInt(String(limit),10)||50));
  const [users, total]=await Promise.all([
    prisma.user.findMany({ where, include:{ staff:true }, orderBy:{createdAt:'desc'}, skip:(p-1)*l, take:l }),
    prisma.user.count({ where }),
  ]);
  const data = users.map(u=>({ ...u, password: undefined, permissions: u.staff ? strToPerms(u.staff.permissions) : [] }));
  res.json({ success:true, data:{ staff: data, total, page:p, limit:l } });
});

router.get('/:id', authorize('ADMIN','MANAGER'), async (req,res)=>{
  const u=await prisma.user.findUnique({ where:{ id:req.params.id }, include:{ staff:true }});
  if (!u || u.role==='CUSTOMER') return res.status(404).json({ success:false, error:'Staff not found' });
  res.json({ success:true, data:{ ...u, password:undefined, permissions: u.staff ? strToPerms(u.staff.permissions) : [] } });
});

router.post('/', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const parsed=createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const exists=await prisma.user.findUnique({ where:{ email:parsed.data.email }});
  if (exists) return res.status(409).json({ success:false, error:'Email already exists' });
  const hashed=await hashPassword(parsed.data.password);
  // resolve restaurantId
  let restaurantId = parsed.data.restaurantId || null;
  if (!restaurantId){
    const me = await prisma.user.findUnique({ where:{ id:req.user!.id }, select:{ restaurantId:true }});
    restaurantId = me?.restaurantId ?? (await prisma.restaurant.findFirst({ select:{id:true}}))?.id ?? null;
  }
  const user=await prisma.user.create({ data:{
    name:parsed.data.name,
    email:parsed.data.email,
    password:hashed,
    phone:parsed.data.phone||null,
    role:parsed.data.role,
    isActive: parsed.data.isActive ?? true,
    restaurantId,
  }});
  const staff=await prisma.staff.create({ data:{ userId:user.id, permissions: permsToStr(parsed.data.permissions||[]) }});
  await audit(req.user!.id,'CREATE','Staff',user.id, { email:parsed.data.email, role:parsed.data.role });
  res.status(201).json({ success:true, data:{ ...user, password:undefined, permissions: strToPerms(staff.permissions), staff } });
});

router.put('/:id', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const parsed=updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const existing=await prisma.user.findUnique({ where:{ id:req.params.id }, include:{ staff:true }});
  if (!existing || existing.role==='CUSTOMER') return res.status(404).json({ success:false, error:'Staff not found' });
  // email uniqueness
  if (parsed.data.email && parsed.data.email!==existing.email){
    const dup=await prisma.user.findUnique({ where:{ email:parsed.data.email }});
    if (dup) return res.status(409).json({ success:false, error:'Email already taken' });
  }
  const data:any={};
  if (parsed.data.name!==undefined) data.name=parsed.data.name;
  if (parsed.data.email!==undefined) data.email=parsed.data.email;
  if (parsed.data.phone!==undefined) data.phone=parsed.data.phone||null;
  if (parsed.data.role!==undefined) data.role=parsed.data.role;
  if (parsed.data.isActive!==undefined) data.isActive=parsed.data.isActive;
  if (parsed.data.restaurantId!==undefined) data.restaurantId=parsed.data.restaurantId||null;
  const user=await prisma.user.update({ where:{ id:req.params.id }, data });
  if (parsed.data.permissions!==undefined){
    if (existing.staff){
      await prisma.staff.update({ where:{ userId:user.id }, data:{ permissions: permsToStr(parsed.data.permissions) }});
    } else {
      await prisma.staff.create({ data:{ userId:user.id, permissions: permsToStr(parsed.data.permissions) }});
    }
  }
  const updated=await prisma.user.findUnique({ where:{ id:user.id }, include:{ staff:true }});
  await audit(req.user!.id,'UPDATE','Staff',user.id, parsed.data);
  res.json({ success:true, data:{ ...updated!, password:undefined, permissions: updated!.staff? strToPerms(updated!.staff.permissions):[] } });
});

router.delete('/:id', authorize('ADMIN'), async (req:AuthRequest,res)=>{
  const existing=await prisma.user.findUnique({ where:{ id:req.params.id }});
  if (!existing || existing.role==='CUSTOMER') return res.status(404).json({ success:false, error:'Staff not found' });
  if (existing.id===req.user!.id) return res.status(400).json({ success:false, error:'Cannot delete yourself' });
  await prisma.staff.deleteMany({ where:{ userId:req.params.id }});
  await prisma.user.delete({ where:{ id:req.params.id }});
  await audit(req.user!.id,'DELETE','Staff',req.params.id,null);
  res.json({ success:true, data:{ id:req.params.id } });
});

// PUT /api/staff/:id/permissions
router.put('/:id/permissions', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const parsed=permUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const existing=await prisma.user.findUnique({ where:{ id:req.params.id }, include:{ staff:true }});
  if (!existing) return res.status(404).json({ success:false, error:'Staff not found' });
  // validate perms
  const invalid=parsed.data.permissions.filter(p=>! (PERMS as readonly string[]).includes(p));
  if (invalid.length) return res.status(400).json({ success:false, error:'Invalid permissions: '+invalid.join(', ') });
  let staff = existing.staff;
  if (staff) staff = await prisma.staff.update({ where:{ userId:existing.id }, data:{ permissions: permsToStr(parsed.data.permissions) }});
  else staff = await prisma.staff.create({ data:{ userId:existing.id, permissions: permsToStr(parsed.data.permissions) }});
  await audit(req.user!.id,'UPDATE_PERMISSIONS','Staff',existing.id, parsed.data);
  res.json({ success:true, data:{ userId:existing.id, permissions: strToPerms(staff.permissions) } });
});

// POST /api/staff/:id/reset-password
router.post('/:id/reset-password', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const schema=z.object({ password:z.string().min(6).max(100) });
  const parsed=schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const existing=await prisma.user.findUnique({ where:{ id:req.params.id }});
  if (!existing) return res.status(404).json({ success:false, error:'Staff not found' });
  const hashed=await hashPassword(parsed.data.password);
  await prisma.user.update({ where:{ id:req.params.id }, data:{ password:hashed }});
  await audit(req.user!.id,'RESET_PASSWORD','Staff',req.params.id,null);
  res.json({ success:true, data:{ id:req.params.id } });
});

export default router;
