'use client';
import {useCart} from '@/lib/cart';
import {useAuth} from '@/lib/auth';
import {api} from '@/lib/api';
import Link from 'next/link';
import {useState} from 'react';
import {useRouter} from 'next/navigation';

export default function CartPage(){
  const {items, inc, dec, remove, total, clear, tableLabel, tableToken}=useCart();
  const {user}=useAuth(); const router=useRouter();
  const [note,setNote]=useState(''); const [placing,setPlacing]=useState(false); const [msg,setMsg]=useState('');
  const sum=total();
  async function placeOrder(){
    if(!items.length) return;
    if(!user){ router.push('/login?next=/cart'); return; }
    setPlacing(true); setMsg('');
    try{
      const payload={ items: items.map(i=>({ menuItemId:i.id, quantity:i.qty, note:i.note })), note, tableToken: tableToken || undefined };
      const d:any=await api.post('/orders', payload);
      clear(); setMsg('Order placed! Order #'+(d?.id||d?.order?.id||''));
      setTimeout(()=>router.push('/orders'),1200);
    }catch(e:any){ setMsg(e.message); }
    finally{ setPlacing(false)}
  }
  if(items.length===0) return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="card p-10 text-center">
        <div className="text-5xl">🛒</div>
        <h2 className="font-bold text-xl mt-3">Your cart is empty</h2>
        <p className="text-sm text-zinc-500">Add dishes from the menu to get started.</p>
        <Link href="/menu" className="btn btn-primary mt-4">Browse Menu</Link>
      </div>
    </div>
  );
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Your Cart</h1>
        {tableLabel && <div className="card p-3 text-sm bg-orange-50 border-orange-200">Table: <b>{tableLabel}</b> {tableToken && <span className="text-zinc-500">• {tableToken.slice(0,8)}…</span>}</div>}
        <div className="space-y-3">
          {items.map(it=>(
            <div key={it.id} className="card p-4 flex gap-4 items-center">
              <img src={it.image||'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200'} className="h-16 w-16 rounded-xl object-cover"/>
              <div className="flex-1">
                <div className="font-semibold">{it.name}</div>
                <div className="text-sm text-zinc-500">₹{it.price} × {it.qty} = <b className="text-zinc-900">₹{it.price*it.qty}</b></div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={()=>dec(it.id)} className="h-8 w-8 rounded-lg border bg-white">−</button>
                <span className="w-6 text-center font-medium">{it.qty}</span>
                <button onClick={()=>inc(it.id)} className="h-8 w-8 rounded-lg border bg-white">+</button>
              </div>
              <button onClick={()=>remove(it.id)} className="text-sm text-red-600 hover:underline ml-2">Remove</button>
            </div>
          ))}
        </div>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Any special instructions?" className="input h-24"/>
      </div>
      <div className="card p-6 h-fit space-y-4 sticky top-20">
        <h3 className="font-bold">Order Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>₹{sum}</span></div>
          <div className="flex justify-between"><span>GST (5%)</span><span>₹{Math.round(sum*0.05)}</span></div>
          <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total</span><span>₹{Math.round(sum*1.05)}</span></div>
        </div>
        {msg && <div className="text-sm p-3 rounded-xl bg-zinc-50 border">{msg}</div>}
        <button onClick={placeOrder} disabled={placing} className="btn btn-primary w-full">{placing?'Placing…':'Place Order'}</button>
        <button onClick={clear} className="btn btn-ghost w-full">Clear Cart</button>
        {!user && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">Please login to place order.</p>}
      </div>
    </div>
  )
}
