'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox} from '@/components/UI';

export default function Inventory(){
  const [items,setItems]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [form,setForm]=useState({name:'',unit:'kg',quantity:'0',lowStockThreshold:'5'});
  async function load(){
    setLoading(true); setErr('');
    try{ const d:any=await api.get('/inventory'); setItems(d.data||d.items||d.inventory||[]); }catch(e:any){ setErr(e.message)} finally{ setLoading(false)}
  }
  useEffect(()=>{ load()},[]);
  async function create(e:React.FormEvent){
    e.preventDefault();
    try{ await api.post('/inventory',{...form, quantity:Number(form.quantity), lowStockThreshold:Number(form.lowStockThreshold)}); setForm({name:'',unit:'kg',quantity:'0',lowStockThreshold:'5'}); load(); }catch(e:any){ alert(e.message)}
  }
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Inventory</h2>
      <form onSubmit={create} className="card p-4 grid md:grid-cols-5 gap-2">
        <input placeholder="Item name" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="input"/>
        <input placeholder="Unit" value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} className="input"/>
        <input placeholder="Qty" type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} className="input"/>
        <input placeholder="Low threshold" type="number" value={form.lowStockThreshold} onChange={e=>setForm({...form,lowStockThreshold:e.target.value})} className="input"/>
        <button className="btn btn-primary">Add</button>
      </form>
      <div className="grid md:grid-cols-2 gap-3">
        {items.map((it:any)=>{
          const id=it.id||it._id; const low=Number(it.quantity)<=Number(it.lowStockThreshold||5);
          return (
            <div key={id} className={`card p-4 flex justify-between items-center ${low?'border-amber-300 bg-amber-50':''}`}>
              <div><div className="font-medium">{it.name} {low && <span className="badge bg-amber-500 text-white ml-2">LOW</span>}</div><div className="text-xs text-zinc-500">{it.quantity} {it.unit} • threshold {it.lowStockThreshold||5}</div></div>
              <button onClick={async()=>{ const q=prompt('New quantity',String(it.quantity)); if(q!==null) try{ await api.put(`/inventory/${id}`,{quantity:Number(q)}); load(); }catch(e:any){ alert(e.message)} }} className="btn btn-ghost text-xs">Update</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
