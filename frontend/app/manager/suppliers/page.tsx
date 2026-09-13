'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox} from '@/components/UI';

export default function Suppliers(){
  const [list,setList]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [form,setForm]=useState({name:'',contact:'',email:'',address:''});
  async function load(){ setLoading(true); setErr(''); try{ const d:any=await api.get('/suppliers'); setList(d.data||d.suppliers||d);}catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  useEffect(()=>{ load()},[]);
  async function create(e:React.FormEvent){ e.preventDefault(); try{ await api.post('/suppliers',form); setForm({name:'',contact:'',email:'',address:''}); load(); }catch(e:any){ alert(e.message)} }
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Suppliers</h2>
      <form onSubmit={create} className="card p-4 grid md:grid-cols-2 gap-2">
        <input placeholder="Supplier name" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="input"/>
        <input placeholder="Contact" value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})} className="input"/>
        <input placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="input"/>
        <input placeholder="Address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} className="input"/>
        <button className="btn btn-primary md:col-span-2">Add Supplier</button>
      </form>
      <div className="space-y-2">
        {list.map((s:any)=>{
          const id=s.id||s._id;
          return <div key={id} className="card p-4 flex justify-between"><div><div className="font-medium">{s.name}</div><div className="text-xs text-zinc-500">{s.contact||''} {s.email?`• ${s.email}`:''}</div></div><button onClick={async()=>{ if(confirm('Delete?')) try{ await api.del(`/suppliers/${id}`); load(); }catch(e:any){ alert(e.message)} }} className="text-xs text-red-600">Delete</button></div>
        })}
      </div>
    </div>
  )
}
