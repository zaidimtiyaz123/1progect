// @ts-nocheck
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(auth);
router.use(authorize('ADMIN','MANAGER'));

router.get('/', async (req:AuthRequest,res)=>{
  const { entity, action, userId, page='1', limit='50', from, to } = req.query as any;
  const where:any={};
  if (entity) where.entity=String(entity);
  if (action) where.action=String(action);
  if (userId) where.userId=String(userId);
  if (from || to){
    where.createdAt={};
    if (from) where.createdAt.gte=new Date(String(from));
    if (to) { const d=new Date(String(to)); d.setHours(23,59,59,999); where.createdAt.lte=d; }
  }
  const p=Math.max(1,parseInt(String(page),10)||1);
  const l=Math.min(100,Math.max(1,parseInt(String(limit),10)||50));
  const [logs, total]=await Promise.all([
    prisma.auditLog.findMany({ where, include:{ user:{ select:{ id:true, name:true, email:true } } }, orderBy:{ createdAt:'desc' }, skip:(p-1)*l, take:l }),
    prisma.auditLog.count({ where }),
  ]);
  const data = logs.map(lg=>({ ...lg, metadata: lg.metadata ? (()=>{ try{return JSON.parse(lg.metadata!);}catch{return lg.metadata;}})() : null }));
  res.json({ success:true, data:{ logs: data, total, page:p, limit:l } });
});

router.get('/:id', async (req,res)=>{
  const log=await prisma.auditLog.findUnique({ where:{ id:req.params.id }, include:{ user:{ select:{id:true,name:true,email:true}} }});
  if (!log) return res.status(404).json({ success:false, error:'Log not found' });
  res.json({ success:true, data:{ ...log, metadata: log.metadata ? (()=>{ try{return JSON.parse(log.metadata);}catch{return log.metadata;}})():null } });
});

export default router;
