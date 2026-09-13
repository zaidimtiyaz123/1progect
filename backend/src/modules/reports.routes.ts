// @ts-nocheck
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { auth, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(auth);

function parseRange(req:AuthRequest){
  const { from, to, period } = req.query as any;
  let start: Date | null = null;
  let end: Date | null = null;
  if (from) start = new Date(String(from));
  if (to) { end = new Date(String(to)); end.setHours(23,59,59,999); }
  if (!start && !end) {
    // default last 30 days
    end = new Date();
    start = new Date();
    start.setDate(end.getDate()-30);
  }
  return { start, end, period: period ? String(period) : 'day' };
}

router.get('/revenue', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const { start, end } = parseRange(req);
  const where:any={};
  if (start) where.createdAt={ ...(where.createdAt||{}), gte:start };
  if (end) where.createdAt={ ...(where.createdAt||{}), lte:end };
  // revenue from orders total (paid orders) + expenses? return net
  const [orderAgg, expensesAgg, ordersCount] = await Promise.all([
    prisma.order.aggregate({ where, _sum:{ total:true, subtotal:true, taxTotal:true }, _count:true }),
    prisma.expense.aggregate({ where: { date: { gte: start? start.toISOString().slice(0,10): undefined, lte: end? end.toISOString().slice(0,10): undefined } } as any, _sum:{ amount:true } }),
    prisma.order.count({ where }),
  ]);
  // daily breakdown
  const orders = await prisma.order.findMany({ where, select:{ total:true, createdAt:true }});
  const daily: Record<string, number> = {};
  for (const o of orders){
    const d=o.createdAt.toISOString().slice(0,10);
    daily[d]=(daily[d]||0)+o.total;
  }
  const dailyArr = Object.entries(daily).map(([date,revenue])=>({date,revenue})).sort((a,b)=>a.date.localeCompare(b.date));
  res.json({ success:true, data:{
    revenue: orderAgg._sum.total||0,
    subtotal: orderAgg._sum.subtotal||0,
    taxTotal: orderAgg._sum.taxTotal||0,
    ordersCount,
    expenses: expensesAgg._sum.amount||0,
    net: (orderAgg._sum.total||0)-(expensesAgg._sum.amount||0),
    daily: dailyArr,
    from: start?.toISOString(), to: end?.toISOString(),
  }});
});

router.get('/orders', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const { start, end } = parseRange(req);
  const where:any={};
  if (start) where.createdAt={ ...(where.createdAt||{}), gte:start };
  if (end) where.createdAt={ ...(where.createdAt||{}), lte:end };
  const [byStatus, total, dailyOrders] = await Promise.all([
    prisma.order.groupBy({ by:['status'], where, _count:{ status:true }, _sum:{ total:true }}),
    prisma.order.count({ where }),
    prisma.order.findMany({ where, select:{ createdAt:true } }),
  ]);
  const daily: Record<string,number>={};
  for (const o of dailyOrders){ const d=o.createdAt.toISOString().slice(0,10); daily[d]=(daily[d]||0)+1; }
  res.json({ success:true, data:{ total, byStatus: byStatus.map(b=>({ status:b.status, count:b._count.status, revenue:b._sum.total||0 })), daily: Object.entries(daily).map(([date,count])=>({date,count})).sort((a,b)=>a.date.localeCompare(b.date)) }});
});

router.get('/bestsellers', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const { start, end } = parseRange(req);
  const limit = Math.min(50, Math.max(1, parseInt(String((req.query as any).limit||'10'),10)||10));
  const orderWhere:any={};
  if (start) orderWhere.createdAt={ ...(orderWhere.createdAt||{}), gte:start };
  if (end) orderWhere.createdAt={ ...(orderWhere.createdAt||{}), lte:end };
  const items = await prisma.orderItem.groupBy({ by:['menuItemId','name'], where:{ order: orderWhere } as any, _sum:{ quantity:true, amount:true }, _count:{ menuItemId:true }, orderBy:{ _sum:{ quantity:'desc'} }, take: limit });
  // enrich with menuItem info
  const ids=items.map(i=>i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({ where:{ id:{ in:ids }}, select:{ id:true, name:true, price:true, imageUrl:true, veg:true }});
  const mMap=new Map(menuItems.map(m=>[m.id,m]));
  const data=items.map(it=>({ menuItemId:it.menuItemId, name:it.name, quantity:it._sum.quantity||0, revenue:it._sum.amount||0, orders:it._count.menuItemId, menuItem: mMap.get(it.menuItemId)||null }));
  res.json({ success:true, data });
});

router.get('/payment-breakdown', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const { start, end } = parseRange(req);
  const where:any={};
  if (start) where.createdAt={ ...(where.createdAt||{}), gte:start };
  if (end) where.createdAt={ ...(where.createdAt||{}), lte:end };
  const groups = await prisma.payment.groupBy({ by:['method','status'], where, _sum:{ amount:true }, _count:{ method:true }});
  const total = await prisma.payment.aggregate({ where, _sum:{ amount:true }});
  res.json({ success:true, data:{ total: total._sum.amount||0, breakdown: groups.map(g=>({ method:g.method, status:g.status, count:g._count.method, amount:g._sum.amount||0 })) }});
});

router.get('/expenses', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const { start, end } = parseRange(req);
  const where:any={};
  if (start) where.date={ ...(where.date||{}), gte:start.toISOString().slice(0,10) };
  if (end) where.date={ ...(where.date||{}), lte:end.toISOString().slice(0,10) };
  const [byCategory, total, daily] = await Promise.all([
    prisma.expense.groupBy({ by:['category'], where, _sum:{ amount:true }, _count:{ category:true }}),
    prisma.expense.aggregate({ where, _sum:{ amount:true }}),
    prisma.expense.findMany({ where, select:{ date:true, amount:true }}),
  ]);
  const dailyMap:Record<string,number>={};
  for (const e of daily) dailyMap[e.date]=(dailyMap[e.date]||0)+e.amount;
  res.json({ success:true, data:{
    total: total._sum.amount||0,
    byCategory: byCategory.map(b=>({ category:b.category, count:b._count.category, amount:b._sum.amount||0 })).sort((a,b)=>b.amount-a.amount),
    daily: Object.entries(dailyMap).map(([date,amount])=>({date,amount})).sort((a,b)=>a.date.localeCompare(b.date)),
  }});
});

router.get('/inventory', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const items = await prisma.inventoryItem.findMany({ include:{ supplier:true }, orderBy:{ currentQty:'asc' }});
  const lowStock = items.filter(i=> i.currentQty <= i.minQty);
  const totalValue = items.reduce((s,i)=> s + i.currentQty * i.purchasePrice, 0);
  const recentWastage = await prisma.inventoryTransaction.findMany({ where:{ type:'WASTAGE' }, orderBy:{ createdAt:'desc' }, take:20, include:{ inventoryItem:true }});
  res.json({ success:true, data:{ totalItems: items.length, lowStockCount: lowStock.length, lowStock, totalValue, recentWastage }});
});

router.get('/dashboard', authorize('ADMIN','MANAGER'), async (req:AuthRequest,res)=>{
  const { start, end } = parseRange(req);
  const orderWhere:any={};
  if (start) orderWhere.createdAt={ ...(orderWhere.createdAt||{}), gte:start };
  if (end) orderWhere.createdAt={ ...(orderWhere.createdAt||{}), lte:end };
  const [ordersAgg, paymentsAgg, expensesAgg, lowStock] = await Promise.all([
    prisma.order.aggregate({ where: orderWhere, _sum:{ total:true }, _count:true }),
    prisma.payment.aggregate({ where: orderWhere, _sum:{ amount:true }}),
    prisma.expense.aggregate({ where:{ date:{ gte: start? start.toISOString().slice(0,10):undefined, lte: end? end.toISOString().slice(0,10):undefined }} as any, _sum:{ amount:true }}),
    prisma.inventoryItem.findMany({ where:{} }),
  ]);
  const low = lowStock.filter(i=> i.currentQty <= i.minQty);
  const pendingOrders = await prisma.order.count({ where:{ status:{ in:['NEW','CONFIRMED','PREPARING'] } }});
  res.json({ success:true, data:{
    revenue: ordersAgg._sum.total||0,
    orders: ordersAgg._count,
    payments: paymentsAgg._sum.amount||0,
    expenses: expensesAgg._sum.amount||0,
    net: (ordersAgg._sum.total||0)-(expensesAgg._sum.amount||0),
    lowStockCount: low.length,
    pendingOrders,
    from: start?.toISOString(), to: end?.toISOString(),
  }});
});

export default router;
