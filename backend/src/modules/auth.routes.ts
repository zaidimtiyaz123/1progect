// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { auth, AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
  name: z.string().min(1).max(100),
  phone: z.string().optional(),
  role: z.enum(['CUSTOMER', 'WAITER', 'CHEF', 'MANAGER', 'ADMIN', 'CASHIER']).optional().default('CUSTOMER'),
  restaurantId: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const seedManagerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
  name: z.string().min(1).max(100),
  phone: z.string().optional(),
  restaurantId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function safeUser(user: any) {
  const { password: _pw, ...rest } = user;
  return rest;
}

function validationError(res: any, err: z.ZodError) {
  return res.status(400).json({ success: false, error: err.errors.map((e) => e.message).join(', ') });
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { email, password, name, phone, role, restaurantId } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ success: false, error: 'Email already registered' });

    // If restaurantId provided, verify it exists
    if (restaurantId) {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant) return res.status(400).json({ success: false, error: 'Invalid restaurantId' });
    }

    const hashed = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name,
        phone,
        role,
        restaurantId: restaurantId || null,
      },
    });

    // Create role-specific profile
    if (role === 'CUSTOMER') {
      await prisma.customer.create({ data: { userId: user.id } });
    } else {
      // Staff profile for non-customer roles
      await prisma.staff.create({ data: { userId: user.id, permissions: '' } });
    }

    await audit(user.id, 'REGISTER', 'User', user.id, { email, role });

    const token = signToken({ id: user.id, role: user.role, email: user.email });

    return res.status(201).json({ success: true, data: { user: safeUser(user), token } });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    if (!user.isActive) return res.status(403).json({ success: false, error: 'Account is deactivated' });

    const ok = await verifyPassword(password, user.password);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = signToken({ id: user.id, role: user.role, email: user.email });

    await audit(user.id, 'LOGIN', 'User', user.id, { email });

    return res.json({ success: true, data: { user: safeUser(user), token } });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me  (requires JWT)
// ---------------------------------------------------------------------------
router.get('/me', auth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { restaurant: true, customer: true, staff: true },
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, data: safeUser(user) });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/seed-manager  (bootstrap first manager; unauthenticated if none exists)
// ---------------------------------------------------------------------------
router.post('/seed-manager', async (req, res) => {
  try {
    const parsed = seedManagerSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { email, password, name, phone, restaurantId } = parsed.data;

    // If a MANAGER already exists, this endpoint is locked — require existing manager/admin token
    // We allow seeding only when no manager exists, or caller is already MANAGER/ADMIN.
    const managerCount = await prisma.user.count({ where: { role: 'MANAGER' } });

    if (managerCount > 0) {
      // Require auth for subsequent seeds — check Authorization header manually (optional protection)
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        return res.status(403).json({ success: false, error: 'Manager already exists. Authentication required.' });
      }
      // If header present, verify role — reuse logic without blocking unauthenticated flow above
      // For simplicity, reject creation if already seeded and unauthenticated
      return res.status(409).json({ success: false, error: 'Manager already seeded' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ success: false, error: 'Email already registered' });

    if (restaurantId) {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant) return res.status(400).json({ success: false, error: 'Invalid restaurantId' });
    }

    const hashed = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name,
        phone,
        role: 'MANAGER',
        restaurantId: restaurantId || null,
      },
    });

    await prisma.staff.create({ data: { userId: user.id, permissions: 'all' } });

    await audit(user.id, 'SEED_MANAGER', 'User', user.id, { email });

    const token = signToken({ id: user.id, role: user.role, email: user.email });

    return res.status(201).json({ success: true, data: { user: safeUser(user), token } });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Seed manager failed' });
  }
});

export default router;
