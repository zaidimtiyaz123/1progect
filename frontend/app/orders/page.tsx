'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {getSocket} from '@/lib/socket';
import {Loading,ErrorBox,Empty} from '@/components/UI';
import ProtectedRoute from '@/components/ProtectedRoute';

function StatusBadge({s}:{s:string}){
  const m:any={PENDING:'bg-amber-100 text-amber-800 border-amber-200', PREPARING:'bg-blue-100 text-blue-800 border-blue-200', READY:'bg-emerald-100 text-emerald-800 border-emerald-200', SERVED:'bg-zinc-900 text-white', CANCELLED:'bg-red-100 text-red-800', PAID:'bg-violet-100 text-violet-800'};
  return <span className={`badge border ${m[s]||'bg-zinc-100'}`}>{s}</span>
}
export default function OrdersPage(){
  return <ProtectedRoute><OrdersInner/></ProtectedRoute>
}
function OrdersInner(){
  const [orders,setOrders]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  async function load(){
    setLoading(true); setErr('');
    try{
      let d:any=null;
      try{ d=await api.get('/orders/my'); }catch{ d=await api.get('/orders'); }
      const list=d.data||d.orders||d;
      setOrders(Array.isArray(list)?list: list?.items||[]);
    }catch(e:any){ setErr(e.message)} finally{ setLoading(false)}
  }
  useEffect(()=>{ load();
    let s:any=null;
    try{
      s=getSocket(); if(!s) return;
      s.on('order:update',(payload:any)=>{
        setOrders(prev=> prev.map(o=> o.id===payload.id||o._id===payload.id ? {...o, ...payload}: o));
      });
      s.on('order:created',(payload:any)=> setOrders(prev=>[payload,...prev]));
    }catch{}
    return ()=>{ try{ s?.off('order:update'); s?.off('order:created'); }catch{} }
  },[]);
  if(loading) return <div className="mx-auto max-w-3xl px-4 py-6"><Loading/></div>;
  if(err) return <div className="mx-auto max-w-3xl px-4 py-6"><ErrorBox msg={err} onRetry={load}/></div>;
  if(!orders.length) return <div className="mx-auto max-w-3xl px-4 py-6"><Empty title="No orders yet" desc="Your live orders will appear here." action={<a href='/menu' className='btn btn-primary'>Browse Menu</a>} /></div>;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold">My Orders <span className="text-sm font-normal text-zinc-500">• live updates</span></h1>
      <div className="space-y-3">
        {orders.map((o:any)=>{
          const id=o.id||o._id;
          return (
            <div key={id} className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Order #{String(id).slice(0,8).toUpperCase()} <span className="text-xs text-zinc-500">{o.createdAt?new Date(o.createdAt).toLocaleString():''}</span></div>
                <StatusBadge s={o.status||'PENDING'}/>
              </div>
              <div className="space-y-1 text-sm">
                {(o.items||o.orderItems||[]).map((it:any,idx:number)=>(
                  <div key={idx} className="flex justify-between"><span>{it.name||it.menuItem?.name||it.menuItemId} × {it.quantity||it.qty||1}</span><span>₹{it.price? it.price*(it.quantity||1): ''}</span></div>
                ))}
              </div>
              <div className="flex justify-between font-bold border-t pt-2"><span>Total</span><span>₹{o.total||o.totalAmount||'-'}</span></div>
              {o.table && <div className="text-xs text-zinc-500">Table: {o.table.label||o.table.name||o.tableId}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
