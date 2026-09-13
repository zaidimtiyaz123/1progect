'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox,Empty} from '@/components/UI';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function BookingsPage(){ return <ProtectedRoute><Inner/></ProtectedRoute> }
function Inner(){
  const [list,setList]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  async function load(){
    setLoading(true); setErr('');
    try{
      let d:any=null;
      try{ d=await api.get('/reservations/my'); }catch{ try{ d=await api.get('/bookings/my'); }catch{ d=await api.get('/reservations'); } }
      const arr=d.data||d.reservations||d.bookings||d;
      setList(Array.isArray(arr)?arr: arr?.items||[]);
    }catch(e:any){ setErr(e.message)} finally{ setLoading(false)}
  }
  useEffect(()=>{ load()},[]);
  async function cancel(id:string){
    try{ await api.del(`/reservations/${id}`); setList(p=>p.filter(x=>(x.id||x._id)!==id)); }catch{
      try{ await api.del(`/bookings/${id}`); setList(p=>p.filter(x=>(x.id||x._id)!==id)); }catch(e:any){ alert(e.message)}
    }
  }
  if(loading) return <div className="mx-auto max-w-3xl px-4 py-6"><Loading/></div>;
  if(err) return <div className="mx-auto max-w-3xl px-4 py-6"><ErrorBox msg={err} onRetry={load}/></div>;
  if(!list.length) return <div className="mx-auto max-w-3xl px-4 py-6"><Empty title="No bookings" desc="Reserve a table to see it here."/></div>;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold">My Bookings</h1>
      {list.map((b:any)=>{
        const id=b.id||b._id;
        return (
          <div key={id} className="card p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">{b.table?.label||b.table?.name||b.tableId} • {b.guests||b.pax||'-'} guests</div>
              <div className="text-sm text-zinc-500">{b.date? new Date(b.date).toLocaleString(): b.slot||''} • <span className="badge bg-zinc-100 border">{b.status||'CONFIRMED'}</span></div>
            </div>
            <button onClick={()=>cancel(id)} className="btn btn-ghost text-red-600">Cancel</button>
          </div>
        )
      })}
    </div>
  )
}
