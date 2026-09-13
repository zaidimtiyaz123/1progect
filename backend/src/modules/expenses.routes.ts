// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(auth);

const createSchema = z.object({
  category: z.string().min(1).max(80),
  amount: z.number().int().min(1),
  description: z.string().optional().nullable(),
  date: z.string().min(1), // YYYY-MM-DD
  paymentMethod: z.string().optional().nullable(),
});
const updateSchema = createSchema.partial();

router.get('/', async (req,res)=>{
  const { category, from, to, page='1', limit='50' } = req.query as any;
  const where:any={};
  if (category) where.category=String(category);
  if (from || to){
    // date stored as string YYYY-MM-DD, so string comparison works
    if (from && to) where.date={ gte:String(from), lte:String(to) };
    else if (from) where.date={ gte:String(from) };
    else where.date={ lte:String(to) };
  }
  const p=Math.max(1,parseInt(String(page),10)||1);
  const l=Math.min(100,Math.max(1,parseInt(String(limit),10)||50));
  const [expenses, total]=await Promise.all([
    prisma.expense.findMany({ where, orderBy:{ date:'desc' }, skip:(p-1)*l, take:l }),
    prisma.expense.count({ where }),
  ]);
  const totalAmount = await prisma.expense.aggregate({ where, _sum:{ amount:true }});
  res.json({ success:true, data:{ expenses, total, page:p, limit:l, sum: totalAmount._sum.amount || 0 } });
});

router.get('/:id', async (req,res)=>{
  const e = await prisma.expense.findUnique({ where:{ id:req.params.id }});
  if (!e) return res.status(404).json({ success:false, error:'Expense not found' });
  res.json({ success:true, data:e });
});

router.post('/', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const parsed=createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const exp=await prisma.expense.create({ data:{
    category: parsed.data.category,
    amount: parsed.data.amount,
    description: parsed.data.description || null,
    date: parsed.data.date,
    paymentMethod: parsed.data.paymentMethod || null,
    recordedById: req.user!.id,
  }});
  await audit(req.user!.id,'CREATE','Expense',exp.id, parsed.data);
  res.status(201).json({ success:true, data:exp });
});

router.put('/:id', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const parsed=updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  const existing=await prisma.expense.findUnique({ where:{ id:req.params.id }});
  if (!existing) return res.status(404).json({ success:false, error:'Expense not found' });
  const exp=await prisma.expense.update({ where:{ id:req.params.id }, data:{
    category: parsed.data.category ?? undefined,
    amount: parsed.data.amount ?? undefined,
    description: parsed.data.description !== undefined ? (parsed.data.description||null) : undefined,
    date: parsed.data.date ?? undefined,
    paymentMethod: parsed.data.paymentMethod !== undefined ? (parsed.data.paymentMethod||null) : undefined,
  }});
  await audit(req.user!.id,'UPDATE','Expense',exp.id, parsed.data);
  res.json({ success:true, data:exp });
});

router.delete('/:id', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const existing=await prisma.expense.findUnique({ where:{ id:req.params.id }});
  if (!existing) return res.status(404).json({ success:false, error:'Expense not found' });
  await prisma.expense.delete({ where:{ id:req.params.id }});
  await audit(req.user!.id,'DELETE','Expense',req.params.id,null);
  res.json({ success:true, data:{ id:req.params.id } });
});

export default router;
