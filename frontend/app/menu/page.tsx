'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {api} from '@/lib/api';
import {useCart} from '@/lib/cart';
import {Loading,ErrorBox,Empty} from '@/components/UI';

export default function MenuPage(){
  const [items,setItems]=useState<any[]>([]);
  const [q,setQ]=useState(''); const [cat,setCat]=useState('All');
  const [cats,setCats]=useState<string[]>(['All']);
  const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const add=useCart(s=>s.add);
  async function load(){
    setLoading(true); setErr('');
    try{
      const d:any=await api.get('/menu');
      const list=d.data||d.items||d.menu||d;
      const arr=Array.isArray(list)?list: list?.items||[];
      setItems(arr);
      const unique=[...new Set(arr.map((x:any)=>x.category||x.categoryName).filter(Boolean))] as string[];
      if(unique.length) setCats(['All',...unique]);
    }catch(e:any){ setErr(e.message); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ load() },[]);
  const filtered=items.filter(x=>{
    const matchQ=!q || (x.name||'').toLowerCase().includes(q.toLowerCase()) || (x.description||'').toLowerCase().includes(q.toLowerCase());
    const matchC=cat==='All' || (x.category||x.categoryName)===cat;
    return matchQ && matchC;
  });
  if(loading) return <div className="mx-auto max-w-7xl px-4 py-6"><Loading/></div>;
  if(err) return <div className="mx-auto max-w-7xl px-4 py-6"><ErrorBox msg={err} onRetry={load}/></div>;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
        <h1 className="text-2xl font-bold">Menu</h1>
        <div className="flex gap-2 flex-1 md:max-w-xl">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search dishes, e.g. biryani" className="input flex-1"/>
          <Link href="/cart" className="btn btn-primary whitespace-nowrap">View Cart</Link>
        </div>
      </div>
      <div className="flex gap-2 overflow-auto pb-1">
        {cats.map(c=>(
          <button key={c} onClick={()=>setCat(c)} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border ${cat===c?'bg-zinc-900 text-white border-zinc-900':'bg-white hover:bg-zinc-50'}`}>{c}</button>
        ))}
      </div>
      {filtered.length===0 ? <Empty title="No dishes found" desc="Try a different search or category."/> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((it:any)=>(
            <div key={it.id||it._id} className="card overflow-hidden flex flex-col">
              <Link href={`/menu/${it.id||it._id}`} className="block">
                <img src={it.image||it.imageUrl||'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600'} alt={it.name} className="h-44 w-full object-cover"/>
              </Link>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/menu/${it.id||it._id}`} className="font-semibold leading-tight hover:text-orange-600">{it.name}</Link>
                  <span className="font-bold text-orange-600">₹{it.price}</span>
                </div>
                <p className="text-sm text-zinc-500 line-clamp-2 flex-1">{it.description||'Delicious and freshly prepared.'}</p>
                <div className="flex gap-2 pt-2">
                  <Link href={`/menu/${it.id||it._id}`} className="btn btn-ghost flex-1">View</Link>
                  <button onClick={()=>add({id:it.id||it._id, name:it.name, price:Number(it.price), image:it.image||it.imageUrl})} className="btn btn-primary flex-1">Add</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
