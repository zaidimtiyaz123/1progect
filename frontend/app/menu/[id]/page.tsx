'use client';
import {useEffect,useState} from 'react';
import {useParams, useRouter} from 'next/navigation';
import {api} from '@/lib/api';
import {useCart} from '@/lib/cart';
import {Loading,ErrorBox} from '@/components/UI';
import Link from 'next/link';

export default function MenuDetail(){
  const {id}=useParams() as {id:string};
  const [item,setItem]=useState<any>(null); const [loading,setLoading]=useState(true); const [err,setErr]=useState(''); const [qty,setQty]=useState(1);
  const add=useCart(s=>s.add); const router=useRouter();
  useEffect(()=>{
    (async()=>{
      try{ const d:any=await api.get(`/menu/${id}`); setItem(d.data||d.item||d); }catch(e:any){ setErr(e.message)} finally{ setLoading(false)}
    })()
  },[id]);
  if(loading) return <div className="mx-auto max-w-3xl px-4 py-6"><Loading/></div>;
  if(err) return <div className="mx-auto max-w-3xl px-4 py-6"><ErrorBox msg={err}/></div>;
  if(!item) return <div className="mx-auto max-w-3xl px-4 py-6">Not found</div>;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 grid md:grid-cols-2 gap-8">
      <img src={item.image||item.imageUrl||'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800'} alt={item.name} className="rounded-2xl w-full h-[380px] object-cover border"/>
      <div className="space-y-4">
        <Link href="/menu" className="text-sm text-zinc-500 hover:text-zinc-900">← Back to menu</Link>
        <h1 className="text-3xl font-bold">{item.name}</h1>
        <p className="text-zinc-500">{item.description}</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black text-orange-600">₹{item.price}</span>
          {item.category && <span className="badge bg-zinc-100 border">{item.category||item.categoryName}</span>}
          {item.veg!==undefined && <span className={`badge ${item.veg?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-red-50 text-red-700 border-red-200'}`}>{item.veg?'VEG':'NON-VEG'}</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border rounded-xl px-2 py-1">
            <button onClick={()=>setQty(Math.max(1,qty-1))} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-zinc-100">−</button>
            <span className="w-8 text-center font-semibold">{qty}</span>
            <button onClick={()=>setQty(qty+1)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-zinc-100">+</button>
          </div>
          <button onClick={()=>{ add({id:item.id||item._id, name:item.name, price:Number(item.price), image:item.image||item.imageUrl, qty}); router.push('/cart')}} className="btn btn-primary flex-1">Add to Cart • ₹{Number(item.price)*qty}</button>
        </div>
        <div className="card p-4 text-sm text-zinc-600">Prepared fresh • 15-20 min • Custom notes can be added in cart.</div>
      </div>
    </div>
  )
}
