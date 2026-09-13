'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
const links=[
  {href:'/manager',label:'Overview'},
  {href:'/manager/menu',label:'Menu'},
  {href:'/manager/tables',label:'Tables'},
  {href:'/manager/qr',label:'QR Codes'},
  {href:'/manager/staff',label:'Staff'},
  {href:'/manager/inventory',label:'Inventory'},
  {href:'/manager/suppliers',label:'Suppliers'},
  {href:'/manager/purchases',label:'Purchases'},
  {href:'/manager/reports',label:'Reports'},
  {href:'/manager/expenses',label:'Expenses'},
  {href:'/manager/settings',label:'Settings'},
];
export default function ManagerLayout({children}:{children:React.ReactNode}){
  const path=usePathname();
  return (
    <ProtectedRoute roles={['MANAGER','ADMIN']}>
      <div className="mx-auto max-w-7xl px-4 py-6 grid lg:grid-cols-[240px_1fr] gap-6">
        <aside className="card p-3 h-fit sticky top-20 space-y-1">
          <div className="px-3 py-2 font-black tracking-tight">MANAGER</div>
          {links.map(l=>(
            <Link key={l.href} href={l.href} className={`block px-3 py-2 rounded-xl text-sm ${path===l.href?'bg-orange-600 text-white':'hover:bg-zinc-50'}`}>{l.label}</Link>
          ))}
          <Link href="/staff" className="block px-3 py-2 text-xs text-zinc-500">→ Staff Dashboard</Link>
        </aside>
        <div>{children}</div>
      </div>
    </ProtectedRoute>
  )
}
