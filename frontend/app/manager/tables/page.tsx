'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox} from '@/components/UI';
import TableGrid from '@/components/TableGrid';

export default function ManagerTables(){
  const [tables,setTables]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [form,setForm]=useState({label:'',capacity:'4'});
  async function load(){ setLoading(true); setErr(''); try{ const d:any=await api.get('/tables'); setTables(d.data||d.tables||d);}catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  useEffect(()=>{ load()},[]);
  async function create(e:React.FormEvent){
    e.preventDefault();
    try{ await api.post('/tables',{label:form.label||undefined, capacity:Number(form.capacity)}); setForm({label:'',capacity:'4'}); load(); }catch(e:any){ alert(e.message)}
  }
  async function del(id:string){ if(!confirm('Delete table?'))return; try{ await api.del(`/tables/${id}`); load(); }catch(e:any){ alert(e.message)} }
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Tables</h2>
      <form onSubmit={create} className="card p-4 flex gap-2">
        <input placeholder="Label (e.g. T-12, Garden-1)" value={form.label} onChange={e=>setForm({...form,label:e.target.value})} className="input"/>
        <input type="number" min={1} value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})} className="input !w-32"/>
        <button className="btn btn-primary">Add Table</button>
      </form>
      <TableGrid tables={tables} />
      <div className="space-y-2">
        {tables.map((t:any)=>{
          const id=t.id||t._id;
          return <div key={id} className="card p-3 flex justify-between items-center text-sm"><span>{t.label||t.name||id.slice(0,8)} • {t.capacity||t.seats} seats • {t.status||'AVAILABLE'}</span><button onClick={()=>del(id)} className="text-red-600 text-xs">Delete</button></div>
        })}
      </div>
    </div>
  )
}
