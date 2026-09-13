// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const createSchema = z.object({
  userId: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
});

router.get('/', async (req:AuthRequest,res)=>{
  const { page='1', limit='50', unread } = req.query as any;
  const p=Math.max(1,parseInt(String(page),10)||1);
  const l=Math.min(100,Math.max(1,parseInt(String(limit),10)||50));
  // user sees own + role-targeted + broadcast (null userId && null role)
  const where:any={ OR: [ { userId: req.user!.id }, { role: req.user!.role }, { userId:null, role:null } ] };
  // if unread filter
  if (unread==='true') where.isRead=false;
  // Need to combine OR with isRead: prisma where OR + isRead? Use AND
  const finalWhere:any = unread==='true' ? { AND:[ where, { isRead:false } ] } : where;
  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: finalWhere, orderBy:{ createdAt:'desc' }, skip:(p-1)*l, take:l }),
    prisma.notification.count({ where: finalWhere }),
    prisma.notification.count({ where:{ ...where, isRead:false } as any }),
  ]);
  res.json({ success:true, data:{ notifications, total, page:p, limit:l, unreadCount } });
});

router.post('/', async (req:AuthRequest,res)=>{
  const parsed=createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, error:parsed.error.flatten() });
  // only ADMIN/MANAGER can create targeted notifications; regular users can create self
  if (parsed.data.userId && parsed.data.userId !== req.user!.id && !['ADMIN','MANAGER'].includes(req.user!.role)){
    return res.status(403).json({ success:false, error:'Forbidden' });
  }
  if (parsed.data.role && !['ADMIN','MANAGER'].includes(req.user!.role)){
    return res.status(403).json({ success:false, error:'Forbidden' });
  }
  const n=await prisma.notification.create({ data:{
    userId: parsed.data.userId || null,
    role: parsed.data.role || null,
    title: parsed.data.title,
    message: parsed.data.message,
  }});
  res.status(201).json({ success:true, data:n });
});

router.patch('/:id/read', async (req:AuthRequest,res)=>{
  const n=await prisma.notification.findUnique({ where:{ id:req.params.id }});
  if (!n) return res.status(404).json({ success:false, error:'Notification not found' });
  // check access: must be owned or role-matched or broadcast
  const canAccess = !n.userId || n.userId===req.user!.id || n.role===req.user!.role || (!n.userId && !n.role);
  if (!canAccess) return res.status(403).json({ success:false, error:'Forbidden' });
  const updated=await prisma.notification.update({ where:{ id:req.params.id }, data:{ isRead:true }});
  res.json({ success:true, data:updated });
});

router.post('/read-all', async (req:AuthRequest,res)=>{
  const where:any={ OR:[ { userId:req.user!.id }, { role:req.user!.role }, { userId:null, role:null }], isRead:false };
  await prisma.notification.updateMany({ where, data:{ isRead:true }});
  res.json({ success:true, data:{ ok:true } });
});

router.delete('/:id', async (req:AuthRequest,res)=>{
  const n=await prisma.notification.findUnique({ where:{ id:req.params.id }});
  if (!n) return res.status(404).json({ success:false, error:'Notification not found' });
  const isOwner = n.userId===req.user!.id;
  const isAdmin = ['ADMIN','MANAGER'].includes(req.user!.role);
  if (!isOwner && !isAdmin) return res.status(403).json({ success:false, error:'Forbidden' });
  await prisma.notification.delete({ where:{ id:req.params.id }});
  res.json({ success:true, data:{ id:req.params.id } });
});

export default router;
