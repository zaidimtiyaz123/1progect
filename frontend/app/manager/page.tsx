'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading} from '@/components/UI';

export default function ManagerOverview(){
  const [data,setData]=useState<any>(null);
  useEffect(()=>{(async()=>{
    try{
      let d:any=null;
      try{ d=await api.get('/reports/dashboard'); }catch{ try{ d=await api.get('/reports/summary'); }catch{ d={} } }
      setData(d.data||d);
    }catch{ setData({})}
  })()},[]);
  if(!data) return <Loading/>;
  const cards=[
    {k:'Revenue',v: data.totalRevenue||data.revenue||'—'},
    {k:'Orders',v: data.totalOrders||data.orders||'—'},
    {k:'Avg Ticket',v: data.avgOrderValue?`₹${Math.round(data.avgOrderValue)}`:'—'},
    {k:'Tables Occupied',v: data.occupiedTables??data.tables??'—'},
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manager Console</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c=>(
          <div key={c.k} className="card p-6"><div className="text-sm text-zinc-500">{c.k}</div><div className="text-2xl font-black mt-1">{typeof c.v==='number'? `₹${c.v}`: c.v}</div></div>
        ))}
      </div>
      <div className="card p-6">
        <h3 className="font-semibold">Quick Actions</h3>
        <div className="grid sm:grid-cols-3 gap-3 mt-3 text-sm">
          <a href="/manager/menu" className="card p-4 hover:shadow">Manage Menu →</a>
          <a href="/manager/qr" className="card p-4 hover:shadow">Generate QRs →</a>
          <a href="/manager/reports" className="card p-4 hover:shadow">View Reports →</a>
        </div>
      </div>
    </div>
  )
}
