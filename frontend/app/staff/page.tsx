'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading} from '@/components/UI';
import Link from 'next/link';

export default function StaffOverview(){
  const [stats,setStats]=useState<any>(null);
  useEffect(()=>{(async()=>{
    try{
      let d:any=null;
      try{ d=await api.get('/reports/summary'); }catch{ try{ d=await api.get('/analytics/summary'); }catch{ d={orders:0, revenue:0, tables:0} } }
      setStats(d.data||d);
    }catch{ setStats({})}
  })()},[]);
  if(!stats) return <Loading/>;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Staff Dashboard</h1>
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          {k:'Today Orders',v: stats.orders??stats.todayOrders??'—'},
          {k:'Revenue',v: stats.revenue?`₹${stats.revenue}`: stats.totalRevenue?`₹${stats.totalRevenue}`:'—'},
          {k:'Active Tables',v: stats.tables??stats.activeTables??'—'},
        ].map(s=>(
          <div key={s.k} className="card p-6"><div className="text-sm text-zinc-500">{s.k}</div><div className="text-2xl font-black mt-1">{s.v}</div></div>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          {href:'/staff/orders',t:'Manage Orders',d:'Accept, prepare, serve'},
          {href:'/staff/kitchen',t:'Kitchen Display',d:'Live KDS view'},
          {href:'/staff/tables',t:'Table Status',d:'Occupy / free tables'},
          {href:'/staff/bills',t:'Bills & Payments',d:'Generate and settle'},
          {href:'/staff/reservations',t:'Reservations',d:'Upcoming bookings'},
        ].map(c=>(
          <Link key={c.href} href={c.href} className="card p-5 hover:shadow-md transition">
            <div className="font-semibold">{c.t}</div><div className="text-sm text-zinc-500">{c.d}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
