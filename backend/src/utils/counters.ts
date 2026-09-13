import { prisma } from '../lib/prisma.js';
export async function nextOrderNumber() {
  const last = await prisma.order.findFirst({ orderBy: { orderNumber: 'desc' }, select: { orderNumber: true } });
  return (last?.orderNumber || 1000) + 1;
}
export async function nextBillNumber() {
  const last = await prisma.bill.findFirst({ orderBy: { billNumber: 'desc' }, select: { billNumber: true } });
  return (last?.billNumber || 1000) + 1;
}
