'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox} from '@/components/UI';

export default function Expenses(){
  const [list,setList]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [form,setForm]=useState({title:'',amount:'',category:'General',note:''});
  async function load(){ setLoading(true); setErr(''); try{ const d:any=await api.get('/expenses'); setList(d.data||d.expenses||d);}catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  useEffect(()=>{ load()},[]);
  async function create(e:React.FormEvent){ e.preventDefault(); try{ await api.post('/expenses',{...form, amount:Number(form.amount)}); setForm({title:'',amount:'',category:'General',note:''}); load(); }catch(e:any){ alert(e.message)} }
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Expenses</h2>
      <form onSubmit={create} className="card p-4 grid md:grid-cols-4 gap-2">
        <input placeholder="Title" required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className="input"/>
        <input placeholder="Amount ₹" type="number" required value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="input"/>
        <input placeholder="Category" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="input"/>
        <input placeholder="Note" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} className="input"/>
        <button className="btn btn-primary md:col-span-4">Add Expense</button>
      </form>
      <div className="space-y-2">
        {list.map((ex:any)=>{
          const id=ex.id||ex._id;
          return <div key={id} className="card p-3 flex justify-between text-sm"><div><b>{ex.title}</b> • {ex.category} • ₹{ex.amount}</div><div className="text-xs text-zinc-500">{ex.createdAt? new Date(ex.createdAt).toLocaleDateString():''}</div></div>
        })}
      </div>
    </div>
  )
}
