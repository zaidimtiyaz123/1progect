'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox,Empty} from '@/components/UI';

export default function StaffReservations(){
  const [list,setList]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  async function load(){
    setLoading(true); setErr('');
    try{
      let d:any=null; try{ d=await api.get('/reservations'); }catch{ d=await api.get('/bookings'); }
      const arr=d.data||d.reservations||d.bookings||d; setList(Array.isArray(arr)?arr:[]);
    }catch(e:any){ setErr(e.message)} finally{ setLoading(false)}
  }
  useEffect(()=>{ load()},[]);
  async function update(id:string, status:string){
    try{ await api.put(`/reservations/${id}`,{status}); load(); }catch{ try{ await api.put(`/bookings/${id}`,{status}); load(); }catch(e:any){ alert(e.message)} }
  }
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  if(!list.length) return <Empty title="No reservations" desc="Upcoming table bookings will appear here."/>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Reservations</h2>
      {list.map((r:any)=>{
        const id=r.id||r._id;
        return (
          <div key={id} className="card p-4 flex items-center justify-between">
            <div><div className="font-semibold">{r.table?.label||r.tableId} • {r.guests||r.pax} guests</div><div className="text-sm text-zinc-500">{r.date? new Date(r.date).toLocaleString(): r.slot||''} • {r.customer?.name||r.user?.name||''} • <span className="badge bg-zinc-100 border">{r.status||'CONFIRMED'}</span></div></div>
            <div className="flex gap-2"><button onClick={()=>update(id,'CONFIRMED')} className="btn btn-ghost !py-1.5">Confirm</button><button onClick={()=>update(id,'CANCELLED')} className="btn btn-ghost !py-1.5 text-red-600">Cancel</button></div>
          </div>
        )
      })}
    </div>
  )
}
