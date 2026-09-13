'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox} from '@/components/UI';

export default function Purchases(){
  const [list,setList]=useState<any[]>([]); const [suppliers,setSuppliers]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [form,setForm]=useState({supplierId:'',item:'',quantity:'1',cost:'0',note:''});
  async function load(){
    setLoading(true); setErr('');
    try{
      const d:any=await api.get('/purchases'); setList(d.data||d.purchases||d);
      try{ const s:any=await api.get('/suppliers'); setSuppliers(s.data||s.suppliers||[])}catch{}
    }catch(e:any){ setErr(e.message)} finally{ setLoading(false)}
  }
  useEffect(()=>{ load()},[]);
  async function create(e:React.FormEvent){ e.preventDefault(); try{ await api.post('/purchases',{...form, quantity:Number(form.quantity), cost:Number(form.cost)}); setForm({supplierId:'',item:'',quantity:'1',cost:'0',note:''}); load(); }catch(e:any){ alert(e.message)} }
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Purchases</h2>
      <form onSubmit={create} className="card p-4 grid md:grid-cols-3 gap-2">
        <select value={form.supplierId} onChange={e=>setForm({...form,supplierId:e.target.value})} className="input"><option value="">Select supplier</option>{suppliers.map((s:any)=><option key={s.id||s._id} value={s.id||s._id}>{s.name}</option>)}</select>
        <input placeholder="Item" required value={form.item} onChange={e=>setForm({...form,item:e.target.value})} className="input"/>
        <input placeholder="Qty" type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} className="input"/>
        <input placeholder="Cost ₹" type="number" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})} className="input"/>
        <input placeholder="Note" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} className="input md:col-span-2"/>
        <button className="btn btn-primary">Record Purchase</button>
      </form>
      <div className="space-y-2">
        {list.map((p:any)=>{
          const id=p.id||p._id;
          return <div key={id} className="card p-3 flex justify-between text-sm"><div><b>{p.item||p.inventoryItem?.name}</b> • {p.quantity} • ₹{p.cost||p.total} • {p.supplier?.name||p.supplierId||''}</div><div className="text-xs text-zinc-500">{p.createdAt? new Date(p.createdAt).toLocaleDateString():''}</div></div>
        })}
      </div>
    </div>
  )
}
