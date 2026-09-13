'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import TableGrid from '@/components/TableGrid';
import {Loading,ErrorBox} from '@/components/UI';
import {useAuth} from '@/lib/auth';
import {useRouter} from 'next/navigation';

export default function BookPage(){
  const [tables,setTables]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [date,setDate]=useState(new Date().toISOString().slice(0,16)); const [guests,setGuests]=useState(2); const [selected,setSelected]=useState<any>(null);
  const [msg,setMsg]=useState(''); const {user}=useAuth(); const router=useRouter();
  async function load(){
    setLoading(true); setErr('');
    try{ const d:any=await api.get('/tables'); const list=d.data||d.tables||d; setTables(Array.isArray(list)?list:[]); }
    catch(e:any){ setErr(e.message)} finally{ setLoading(false)}
  }
  useEffect(()=>{ load()},[]);
  async function reserve(){
    if(!selected) return setMsg('Select a table first');
    if(!user) return router.push('/login?next=/book');
    setMsg('');
    try{
      await api.post('/reservations', { tableId: selected.id, date, guests: Number(guests) });
      setMsg('Reservation confirmed! Check My Bookings.');
    }catch(e:any){
      // fallback to /bookings
      try{ await api.post('/bookings', { tableId: selected.id, date, guests: Number(guests) }); setMsg('Booking confirmed!'); }
      catch(er:any){ setMsg(er.message)}
    }
  }
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Book a Table</h1>
      <div className="card p-4 grid md:grid-cols-3 gap-4">
        <label className="space-y-1"><span className="text-sm font-medium">Date & Time</span><input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)} className="input"/></label>
        <label className="space-y-1"><span className="text-sm font-medium">Guests</span><input type="number" min={1} max={20} value={guests} onChange={e=>setGuests(Number(e.target.value))} className="input"/></label>
        <div className="flex items-end"><button onClick={reserve} className="btn btn-primary w-full">Reserve {selected?`• ${selected.label||selected.name||selected.id.slice(0,6)}`:''}</button></div>
      </div>
      {msg && <div className="card p-3 text-sm bg-orange-50 border-orange-200">{msg}</div>}
      {loading ? <Loading/> : err ? <ErrorBox msg={err} onRetry={load}/> : <TableGrid tables={tables} onSelect={setSelected}/>}
      {selected && <div className="card p-4 text-sm">Selected: <b>{selected.label||selected.name||selected.id}</b> • Capacity {selected.capacity||selected.seats||'-'}</div>}
    </div>
  )
}
