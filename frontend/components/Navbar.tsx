'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useState } from 'react';

export default function Navbar(){
  const {user,logout}=useAuth();
  const count=useCart(s=>s.count());
  const path=usePathname();
  const [open,setOpen]=useState(false);
  const router=useRouter();
  const navLink=(href:string,label:string)=> (
    <Link href={href} className={`px-3 py-2 rounded-lg text-sm font-medium ${path===href?'bg-zinc-900 text-white':'text-zinc-600 hover:bg-zinc-100'}`}>{label}</Link>
  );
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-zinc-200">
      <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-xl bg-orange-600 grid place-items-center text-white font-black">S</span>
            <span className="font-bold tracking-tight">SAFFRON</span>
            <span className="hidden sm:inline text-xs bg-zinc-900 text-white rounded-full px-2 py-0.5 ml-1">OS</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navLink('/menu','Menu')}
            {navLink('/book','Book Table')}
            {user && navLink('/orders','My Orders')}
            {user && navLink('/bookings','My Bookings')}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/cart" className="relative btn btn-ghost !py-2 !px-3">
            🛒 Cart {count>0 && <span className="ml-2 bg-orange-600 text-white text-xs rounded-full px-2 py-0.5">{count}</span>}
          </Link>
          {!user ? (
            <div className="hidden sm:flex gap-2">
              <Link href="/login" className="btn btn-ghost">Login</Link>
              <Link href="/register" className="btn btn-primary">Sign up</Link>
            </div>
          ):(
            <div className="relative">
              <button onClick={()=>setOpen(!open)} className="flex items-center gap-2 btn btn-ghost !py-1.5">
                <span className="h-7 w-7 rounded-full bg-zinc-900 text-white grid place-items-center text-xs">{user.name?.[0]?.toUpperCase()}</span>
                <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">{user.name}</span>
              </button>
              {open && (
                <div className="absolute right-0 mt-2 w-56 card p-2 space-y-1">
                  <div className="px-3 py-2 text-sm"><div className="font-semibold">{user.name}</div><div className="text-xs text-zinc-500">{user.role}</div></div>
                  <Link href="/profile" onClick={()=>setOpen(false)} className="block px-3 py-2 rounded-lg hover:bg-zinc-50 text-sm">Profile</Link>
                  {(user.role==='STAFF'||user.role==='MANAGER'||user.role==='ADMIN') && <Link href="/staff" onClick={()=>setOpen(false)} className="block px-3 py-2 rounded-lg hover:bg-zinc-50 text-sm">Staff Dashboard</Link>}
                  {(user.role==='MANAGER'||user.role==='ADMIN') && <Link href="/manager" onClick={()=>setOpen(false)} className="block px-3 py-2 rounded-lg hover:bg-zinc-50 text-sm">Manager Dashboard</Link>}
                  <button onClick={()=>{logout(); setOpen(false); router.push('/')}} className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-sm text-red-600">Logout</button>
                </div>
              )}
            </div>
          )}
          <button onClick={()=>setOpen(v=>!v)} className="md:hidden btn btn-ghost !px-3">☰</button>
        </div>
      </div>
      {open && !user && (
        <div className="md:hidden border-t bg-white px-4 py-3 flex gap-2">
          <Link href="/menu" className="btn btn-ghost flex-1">Menu</Link>
          <Link href="/login" className="btn btn-primary flex-1">Login</Link>
        </div>
      )}
    </header>
  )
}
