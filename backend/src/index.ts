// @ts-nocheck
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { prisma } from './lib/prisma.js';
import { setIO } from './lib/socket.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './modules/auth.routes.js';
import restaurantRoutes from './modules/restaurant.routes.js';
import tableRoutes from './modules/tables.routes.js';
import menuRoutes from './modules/menu.routes.js';
import recipeRoutes from './modules/recipes.routes.js';
import reservationRoutes from './modules/reservations.routes.js';
import orderRoutes from './modules/orders.routes.js';
import kitchenRoutes from './modules/kitchen.routes.js';
import billRoutes from './modules/bills.routes.js';
import paymentRoutes from './modules/payments.routes.js';
import inventoryRoutes from './modules/inventory.routes.js';
import supplierRoutes from './modules/suppliers.routes.js';
import purchaseRoutes from './modules/purchases.routes.js';
import expenseRoutes from './modules/expenses.routes.js';
import staffRoutes from './modules/staff.routes.js';
import reportRoutes from './modules/reports.routes.js';
import notificationRoutes from './modules/notifications.routes.js';
import auditRoutes from './modules/audit.routes.js';

const PORT = Number(process.env.PORT || 4000);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const CORS_ORIGINS = [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'].filter(Boolean) as string[];

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || CORS_ORIGINS.includes(origin) || (origin && origin.startsWith('http://localhost'))) return cb(null, true);
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    return cb(null, true);
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const globalLimiter = rateLimit({ windowMs: 60*1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { success:false, error:'Too many requests' }});
app.use('/api', globalLimiter);
const authLimiter = rateLimit({ windowMs: 60*1000, max: 50, standardHeaders: true, legacyHeaders: false, message: { success:false, error:'Too many auth attempts'}});
app.use('/api/auth', authLimiter);

app.get('/health', (_req, res)=> res.json({ success:true, data:{ status:'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }}));
app.get('/api/health', async (_req, res)=>{
  try{ await prisma.$queryRaw`SELECT 1`; res.json({ success:true, data:{ status:'ok', db:'connected', uptime: process.uptime() }}); }
  catch(e:any){ res.status(503).json({ success:false, error:'DB unreachable', details:e.message }); }
});

// Primary mounts
app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/kitchen', kitchenRoutes);
app.use('/api/kitchen-orders', kitchenRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/inventory-items', inventoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/analytics', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/audit', auditRoutes);

// ---- compatibility aliases: frontend uses different path conventions ----
app.use('/api/bookings', reservationRoutes); // alias
app.use('/api/qr', tableRoutes); // so /api/qr/validate/:token etc proxied via tables router fallback

// /api/menu direct fallback: frontend does api.get('/menu') expecting items list
// menuRoutes already handles /categories and /items, but not bare GET /. Provide alias:
app.get('/api/menu-alias-check', (_req,res)=> res.json({ok:true}));
// Bare /api/menu -> return all items (no restaurantId required fallback)
app.get('/api/menu', async (req,res,next)=>{
  // delegate to menu items: reuse same logic without requiring restaurantId
  try{
    const { categoryId, q, featured, isFeatured } = req.query as any;
    // find default restaurant if not provided
    let restaurantId = (req.query as any).restaurantId as string|undefined;
    if(!restaurantId){
      const r = await prisma.restaurant.findFirst();
      restaurantId = r?.id;
      if(!restaurantId) return res.json({ success:true, data:[] });
    }
    const where:any={ restaurantId };
    if(categoryId) where.categoryId=categoryId;
    if(featured==='true'||isFeatured==='true') where.isFeatured=true;
    if(q) where.name={ contains:q };
    const items = await prisma.menuItem.findMany({ where, include:{ category:true }, orderBy:{ createdAt:'desc'} });
    res.json({ success:true, data: items });
  }catch(e){ next(e); }
});

// POST /api/menu alias -> create item
app.post('/api/menu', async (req,res,next)=>{
  // forward to menuRoutes POST /items logic: just create via prisma directly (lenient)
  try{
    const body=req.body;
    let restaurantId=body.restaurantId;
    if(!restaurantId){ const r=await prisma.restaurant.findFirst(); restaurantId=r?.id; }
    if(!restaurantId) return res.status(400).json({ success:false, error:'restaurantId required and no default restaurant' });
    let categoryId=body.categoryId;
    if(!categoryId){ const cat=await prisma.menuCategory.findFirst({ where:{ restaurantId }}); categoryId=cat?.id; }
    if(!categoryId) return res.status(400).json({ success:false, error:'categoryId required' });
    const item=await prisma.menuItem.create({ data:{
      name: body.name, description: body.description||null,
      price: Number(body.price)||0, taxPercent: Number(body.taxPercent)||0,
      imageUrl: body.imageUrl||null, veg: body.veg??true,
      prepTimeMin: Number(body.prepTimeMin)||15, isAvailable: body.isAvailable??true,
      isFeatured: body.isFeatured??false, categoryId, restaurantId
    }});
    res.status(201).json({ success:true, data:item });
  }catch(e){ next(e); }
});

// /api/inventory bare alias
app.get('/api/inventory-alias', (_req,res)=> res.json({ok:true}));

// /api/users alias -> proxy to staff + users
app.get('/api/users', async (req,res,next)=>{
  try{
    const users=await prisma.user.findMany({ select:{ id:true, email:true, name:true, role:true, isActive:true, phone:true, createdAt:true }});
    res.json({ success:true, data: users });
  }catch(e){ next(e); }
});
app.post('/api/users', async (req,res,next)=>{
  try{
    const { name,email,password,role,phone}=req.body;
    if(!email||!password) return res.status(400).json({ success:false, error:'email and password required' });
    const { hashPassword }=await import('./lib/auth.js');
    const hash = await (hashPassword as any)(password);
    const u=await prisma.user.create({ data:{ email, password: hash, name: name||email, role: role||'STAFF', phone: phone||null }});
    // create staff/customer row
    if(['STAFF','MANAGER'].includes(u.role)){
      try{ await prisma.staff.create({ data:{ userId: u.id, permissions:'' }}); }catch{}
    } else {
      try{ await prisma.customer.create({ data:{ userId: u.id }}); }catch{}
    }
    res.status(201).json({ success:true, data:{ id:u.id, email:u.email, name:u.name, role:u.role }});
  }catch(e:any){
    if(String(e.message).includes('Unique')) return res.status(409).json({ success:false, error:'Email already exists' });
    next(e);
  }
});
app.delete('/api/users/:id', async (req,res,next)=>{
  try{
    await prisma.user.delete({ where:{ id: req.params.id }});
    res.json({ success:true, data:{ message:'deleted'}});
  }catch(e){ next(e); }
});

// /api/settings
let _settings:any={ restaurantName:'RestaurantOS', currency:'INR' };
app.get('/api/settings', (_req,res)=> res.json({ success:true, data:_settings }));
app.put('/api/settings', (req,res)=>{ _settings={ ..._settings, ...req.body }; res.json({ success:true, data:_settings }); });
app.post('/api/settings', (req,res)=>{ _settings={ ..._settings, ...req.body }; res.json({ success:true, data:_settings }); });

// Fallback for /api/qr/validate/:token etc
app.get('/api/qr/validate/:token', async (req,res,next)=>{
  try{
    const token=req.params.token;
    const qr=await prisma.tableQrCode.findUnique({ where:{ token }, include:{ table:true }});
    if(!qr) return res.status(404).json({ success:false, error:'Invalid QR token' });
    if(!qr.isActive) return res.status(410).json({ success:false, error:'QR disabled' });
    res.json({ success:true, data:{ table: qr.table, token: qr.token }});
  }catch(e){ next(e); }
});
app.get('/api/tables/qr/:token', async (req,res,next)=>{
  try{
    const token=req.params.token;
    const qr=await prisma.tableQrCode.findUnique({ where:{ token }, include:{ table:true }});
    if(!qr) return res.status(404).json({ success:false, error:'Invalid QR token' });
    res.json({ success:true, data:{ table: qr.table, token }});
  }catch(e){ next(e); }
});

// Reports/dashboard aliases
app.get('/api/reports/dashboard', async (_req,res,next)=>{
  try{
    const today=new Date().toISOString().slice(0,10);
    const [orders, revenueAgg, tables] = await Promise.all([
      prisma.order.count(),
      prisma.order.aggregate({ _sum:{ total:true }}),
      prisma.table.findMany({ select:{ status:true }})
    ]);
    const revenue = (revenueAgg._sum.total||0);
    const occ = tables.filter(t=>t.status==='OCCUPIED').length;
    const avail = tables.filter(t=>t.status==='AVAILABLE').length;
    res.json({ success:true, data:{ orders, revenue, revenuePaise: revenue, tables:{ occupied:occ, available:avail, total: tables.length }, date: today }});
  }catch(e){ next(e); }
});
app.get('/api/reports/summary', async (req,res,next)=>{
  // delegate to reports dashboard logic
  try{
    const today=new Date().toISOString().slice(0,10);
    const [orders, revAgg, tables, lowStock, pendingOrders, reservations] = await Promise.all([
      prisma.order.count(),
      prisma.order.aggregate({ _sum:{ total:true }}),
      prisma.table.findMany({ select:{ status:true }}),
      prisma.inventoryItem.findMany({ where:{} }).then(all=> all.filter(i=> i.currentQty < i.minQty).length),
      prisma.order.count({ where:{ status:{ in:['NEW','ACCEPTED','PREPARING'] }}}),
      prisma.reservation.count({ where:{ date: today }})
    ]);
    res.json({ success:true, data:{
      orders, revenue: revAgg._sum.total||0,
      tables:{ occupied: tables.filter(t=>t.status==='OCCUPIED').length, available: tables.filter(t=>t.status==='AVAILABLE').length, total: tables.length },
      lowStock, pendingOrders, reservations, date: today
    }});
  }catch(e){ next(e); }
});

// Orders/my alias - requires auth but we can list by header token user
app.get('/api/orders/my', async (req,res,next)=>{
  try{
    const auth=req.headers.authorization;
    if(!auth) return res.json({ success:true, data:[] });
    try{
      const { verifyToken } = await import('./lib/auth.js');
      const payload=(verifyToken as any)(auth.slice(7));
      const cust=await prisma.customer.findUnique({ where:{ userId: payload.id }});
      if(!cust) return res.json({ success:true, data:[] });
      const orders=await prisma.order.findMany({ where:{ customerId: cust.id }, include:{ items:true }, orderBy:{ createdAt:'desc' }, take:50 });
      return res.json({ success:true, data: orders });
    }catch{ return res.json({ success:true, data:[] }); }
  }catch(e){ next(e); }
});

// Reservations/my alias
app.get('/api/reservations/my', async (req,res,next)=>{
  try{
    const auth=req.headers.authorization;
    if(!auth) return res.json({ success:true, data:[] });
    try{
      const { verifyToken } = await import('./lib/auth.js');
      const payload=(verifyToken as any)(auth.slice(7));
      const cust=await prisma.customer.findUnique({ where:{ userId: payload.id }});
      const where:any= cust ? { customerId: cust.id } : { phone: payload.email };
      const list=await prisma.reservation.findMany({ where, orderBy:{ createdAt:'desc'}, take:50 });
      return res.json({ success:true, data:list });
    }catch{ return res.json({ success:true, data:[] }); }
  }catch(e){ next(e); }
});

// 404
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});
app.get('/', (_req, res) => {
  res.json({ success: true, data: { name: 'RestaurantOS API', version: '1.0.0', health: '/api/health' } });
});
app.use(errorHandler);

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: CORS_ORIGINS, credentials: true, methods: ['GET','POST','PATCH','DELETE','PUT'] },
  transports: ['websocket','polling'],
});
setIO(io);
io.on('connection', (socket)=>{
  console.log('[socket] connected', socket.id);
  socket.on('join', (payload:any)=>{
    try{
      const p= typeof payload==='string'? JSON.parse(payload): payload;
      if(p?.restaurantId) socket.join('restaurant:'+p.restaurantId);
      if(p?.tableId) socket.join('table:'+p.tableId);
      if(p?.room) socket.join(p.room);
      socket.emit('joined',{ok:true});
    }catch(e){ console.warn('[socket] join error',e); }
  });
  socket.on('leave', (payload:any)=>{
    try{ const p= typeof payload==='string'? JSON.parse(payload): payload;
      if(p?.restaurantId) socket.leave('restaurant:'+p.restaurantId);
      if(p?.tableId) socket.leave('table:'+p.tableId);
      if(p?.room) socket.leave(p.room);
    }catch{}
  });
  socket.on('disconnect', (reason)=> console.log('[socket] disconnected', socket.id, reason));
});

if (!process.env.VERCEL) {
  httpServer.listen(PORT, ()=> {
    console.log('[api] listening on http://localhost:'+PORT);
    console.log('[api] health -> http://localhost:'+PORT+'/api/health');
    // ensure default restaurant
    (async()=>{
      try{
        const count=await prisma.restaurant.count();
        if(count===0){
          const r=await prisma.restaurant.create({ data:{ name:'RestaurantOS Demo', address:'Demo Street 1', phone:'9999999999' }});
          console.log('[api] created default restaurant', r.id);
        }
      }catch(e){ console.warn('[api] ensure restaurant failed', e); }
    })();
  });
}

async function shutdown(signal:string){
  console.log('[api] '+signal+' shutting down');
  httpServer.close(()=> console.log('[api] http closed'));
  try{ await prisma.$disconnect(); }catch{}
  process.exit(0);
}
process.on('SIGINT', ()=> shutdown('SIGINT'));
process.on('SIGTERM', ()=> shutdown('SIGTERM'));
process.on('unhandledRejection', (err)=> console.error('[unhandledRejection]',err));
process.on('uncaughtException', (err)=> console.error('[uncaughtException]',err));
export { app, httpServer, io };
