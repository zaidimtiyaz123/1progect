'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox} from '@/components/UI';

export default function ManagerMenu(){
  const [items,setItems]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [form,setForm]=useState({name:'',price:'',category:'Main',description:'',image:''}); const [editing,setEditing]=useState<string|null>(null);
  async function load(){ setLoading(true); setErr(''); try{ const d:any=await api.get('/menu'); const list=d.data||d.items||d.menu||d; setItems(Array.isArray(list)?list:[]);}catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  useEffect(()=>{ load()},[]);
  async function submit(e:React.FormEvent){
    e.preventDefault();
    try{
      const payload={...form, price:Number(form.price)};
      if(editing) await api.put(`/menu/${editing}`,payload);
      else await api.post('/menu',payload);
      setForm({name:'',price:'',category:'Main',description:'',image:''}); setEditing(null); load();
    }catch(e:any){ alert(e.message)}
  }
  async function del(id:string){ if(!confirm('Delete item?'))return; try{ await api.del(`/menu/${id}`); load(); }catch(e:any){ alert(e.message)} }
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Menu Management</h2>
      <form onSubmit={submit} className="card p-4 grid md:grid-cols-2 gap-3">
        <input placeholder="Name" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="input"/>
        <input placeholder="Price" type="number" required value={form.price} onChange={e=>setForm({...form,price:e.target.value})} className="input"/>
        <input placeholder="Category" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="input"/>
        <input placeholder="Image URL" value={form.image} onChange={e=>setForm({...form,image:e.target.value})} className="input"/>
        <textarea placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="input md:col-span-2 h-20"/>
        <div className="md:col-span-2 flex gap-2">
          <button className="btn btn-primary">{editing?'Update':'Create'} Item</button>
          {editing && <button type="button" onClick={()=>{setEditing(null); setForm({name:'',price:'',category:'Main',description:'',image:''})}} className="btn btn-ghost">Cancel</button>}
        </div>
      </form>
      <div className="grid md:grid-cols-2 gap-3">
        {items.map((it:any)=>{
          const id=it.id||it._id;
          return (
            <div key={id} className="card p-4 flex gap-3">
              <img src={it.image||it.imageUrl||'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200'} className="h-16 w-16 rounded-xl object-cover"/>
              <div className="flex-1">
                <div className="font-semibold">{it.name} <span className="text-orange-600">₹{it.price}</span></div>
                <div className="text-xs text-zinc-500">{it.category||it.categoryName} • {it.available===false?'Unavailable':'Available'}</div>
                <div className="text-xs text-zinc-500 line-clamp-1">{it.description}</div>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={()=>{setEditing(id); setForm({name:it.name, price:String(it.price), category:it.category||it.categoryName||'Main', description:it.description||'', image:it.image||it.imageUrl||''})}} className="btn btn-ghost !py-1 text-xs">Edit</button>
                <button onClick={()=>del(id)} className="btn btn-ghost !py-1 text-xs text-red-600">Delete</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
