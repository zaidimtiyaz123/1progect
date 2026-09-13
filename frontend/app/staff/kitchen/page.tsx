'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {getSocket} from '@/lib/socket';
import {Loading} from '@/components/UI';

export default function Kitchen(){
  const [orders,setOrders]=useState<any[]>([]);
  async function load(){
    try{
      const d:any=await api.get('/orders');
      const list=d.data||d.orders||d;
      const arr=Array.isArray(list)?list:[];
      setOrders(arr.filter((o:any)=>['PENDING','PREPARING','READY'].includes((o.status||'').toUpperCase())));
    }catch{}
  }
  useEffect(()=>{
    load();
    let sock:any=null;
    try{
      sock=getSocket();
      const onCreated=(p:any)=> setOrders(prev=>[p,...prev]);
      const onUpdate=(p:any)=>{
        setOrders(prev=>{
          const merged=prev.map(o=> (o.id===p.id||o._id===p.id)?{...o,...p}:o);
          return merged.filter((o:any)=>['PENDING','PREPARING','READY'].includes((o.status||'').toUpperCase()));
        });
      };
      sock.on('order:created', onCreated);
      sock.on('order:update', onUpdate);
    }catch{}
    const id=setInterval(load,10000);
    return ()=>{
      try{ sock?.off('order:created'); sock?.off('order:update'); }catch{}
      clearInterval(id);
    };
  },[]);
  async function bump(id:string, status:string){
    try{ await api.put(`/orders/${id}/status`,{status}); }catch{ try{ await api.put(`/orders/${id}`,{status}); }catch{} }
  }
  if(!orders) return <Loading/>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Kitchen Display</h2>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {orders.map((o:any)=>{
          const id=o.id||o._id;
          const age=o.createdAt? Math.round((Date.now()-new Date(o.createdAt).getTime())/60000):0;
          return (
            <div key={id} className="card p-4 space-y-3 border-2 border-amber-200 bg-amber-50/40">
              <div className="flex justify-between"><span className="font-bold">#{String(id).slice(0,6).toUpperCase()}</span><span className="badge bg-white border">{age}m ago</span></div>
              <div className="text-sm">{(o.items||o.orderItems||[]).map((it:any,i:number)=><div key={i} className="flex justify-between py-1 border-b border-dashed last:border-0"><span className="font-medium">{it.quantity||it.qty}× {it.name||it.menuItem?.name}</span><span className="text-zinc-500">{it.note||''}</span></div>)}</div>
              <div className="flex gap-2">
                <button onClick={()=>bump(id,'PREPARING')} className="btn btn-ghost flex-1 !py-2">Preparing</button>
                <button onClick={()=>bump(id,'READY')} className="btn btn-primary flex-1 !py-2">Ready ✓</button>
              </div>
              <div className="text-xs text-zinc-500">Table: {o.table?.label||o.tableId||'-'} • {o.status}</div>
            </div>
          )
        })}
        {orders.length===0 && <div className="card p-10 text-center text-zinc-500 col-span-full">No active kitchen orders 🎉</div>}
      </div>
    </div>
  )
}
