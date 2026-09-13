'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
const links=[
  {href:'/staff',label:'Overview'},
  {href:'/staff/tables',label:'Tables'},
  {href:'/staff/orders',label:'Orders'},
  {href:'/staff/kitchen',label:'Kitchen'},
  {href:'/staff/bills',label:'Bills'},
  {href:'/staff/reservations',label:'Reservations'},
];
export default function StaffLayout({children}:{children:React.ReactNode}){
  const path=usePathname();
  return (
    <ProtectedRoute roles={['STAFF','MANAGER','ADMIN']}>
      <div className="mx-auto max-w-7xl px-4 py-6 grid lg:grid-cols-[220px_1fr] gap-6">
        <aside className="card p-3 h-fit sticky top-20 space-y-1">
          <div className="px-3 py-2 font-bold text-sm">Staff</div>
          {links.map(l=>(
            <Link key={l.href} href={l.href} className={`block px-3 py-2 rounded-xl text-sm ${path===l.href?'bg-zinc-900 text-white':'hover:bg-zinc-50'}`}>{l.label}</Link>
          ))}
          <Link href="/manager" className="block px-3 py-2 text-xs text-zinc-500 hover:text-zinc-900">→ Manager Console</Link>
        </aside>
        <div>{children}</div>
      </div>
    </ProtectedRoute>
  )
}
