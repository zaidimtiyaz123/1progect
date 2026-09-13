'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {getSocket} from '@/lib/socket';
import {Loading,ErrorBox,Empty} from '@/components/UI';

const statuses=['PENDING','PREPARING','READY','SERVED','PAID','CANCELLED'];

export default function StaffOrders(){
  const [orders,setOrders]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState(''); const [filter,setFilter]=useState('All');
  async function load(){
    setLoading(true); setErr('');
    try{ const d:any=await api.get('/orders'); const list=d.data||d.orders||d; setOrders(Array.isArray(list)?list:[])}catch(e:any){ setErr(e.message)} finally{ setLoading(false)}
  }
  useEffect(()=>{ load();
    let s:any=null;
    try{
      s=getSocket(); if(!s) return;
      s.on('order:created',(p:any)=>setOrders(prev=>[p,...prev]));
      s.on('order:update',(p:any)=>setOrders(prev=>prev.map(o=> (o.id===p.id||o._id===p.id)?{...o,...p}:o)));
    }catch{}
    return ()=>{ try{ s?.off('order:created'); s?.off('order:update')}catch{} }
  },[]);
  async function updateStatus(id:string, status:string){
    try{ await api.put(`/orders/${id}/status`,{status}); }catch{
      try{ await api.put(`/orders/${id}`,{status}); }catch(e:any){ alert(e.message)}
    }
  }
  const filtered=filter==='All'?orders: orders.filter(o=> (o.status||'').toUpperCase()===filter);
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold">Orders <span className="text-sm font-normal text-zinc-500">• live</span></h2>
        <select value={filter} onChange={e=>setFilter(e.target.value)} className="input !w-auto">{['All',...statuses].map(s=><option key={s}>{s}</option>)}</select>
      </div>
      {filtered.length===0? <Empty title="No orders" desc="Orders will appear here in real time."/> : (
        <div className="space-y-3">
          {filtered.map((o:any)=>{
            const id=o.id||o._id;
            return (
              <div key={id} className="card p-4 space-y-3">
                <div className="flex justify-between items-start gap-4">
                  <div><div className="font-semibold">#{String(id).slice(0,8).toUpperCase()} • {o.table?.label||o.tableId||'No table'}</div>
                  <div className="text-xs text-zinc-500">{o.createdAt? new Date(o.createdAt).toLocaleString():''} {o.customer?.name?`• ${o.customer.name}`: o.user?.name?`• ${o.user.name}`:''}</div></div>
                  <span className="badge bg-zinc-900 text-white">{o.status||'PENDING'}</span>
                </div>
                <div className="text-sm space-y-1">
                  {(o.items||o.orderItems||[]).map((it:any,i:number)=>(
                    <div key={i} className="flex justify-between"><span>{it.name||it.menuItem?.name||it.menuItemId} × {it.quantity||it.qty}</span><span className="text-zinc-500">₹{it.price||''}</span></div>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {statuses.map(s=>(
                    <button key={s} onClick={()=>updateStatus(id,s)} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${ (o.status===s)?'bg-zinc-900 text-white border-zinc-900':'bg-white hover:bg-zinc-50'}`}>{s}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
