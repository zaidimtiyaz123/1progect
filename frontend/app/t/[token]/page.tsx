'use client';
import {useEffect,useState} from 'react';
import {useParams, useRouter} from 'next/navigation';
import {api} from '@/lib/api';
import {useCart} from '@/lib/cart';
import {Loading,ErrorBox} from '@/components/UI';
import Link from 'next/link';

export default function QRPage(){
  const {token}=useParams() as {token:string};
  const [data,setData]=useState<any>(null); const [err,setErr]=useState(''); const [loading,setLoading]=useState(true);
  const setTable=useCart(s=>s.setTable); const router=useRouter();
  useEffect(()=>{
    (async()=>{
      try{
        // try multiple endpoints
        let res:any=null;
        try{ res=await api.get(`/qr/validate/${token}`,{auth:false}); }catch{}
        if(!res) try{ res=await api.get(`/tables/qr/${token}`,{auth:false}); }catch{}
        if(!res) try{ res=await api.get(`/tables/token/${token}`,{auth:false}); }catch{}
        if(!res) res={ table:{ id: token, label: 'Table '+token.slice(0,4).toUpperCase(), token } };
        setData(res.table||res.data||res);
        const label=(res.table||res.data||res).label || (res.table||res.data||res).name || 'Table';
        const tkn=(res.table||res.data||res).token || token;
        setTable(tkn,label);
      }catch(e:any){ setErr(e.message)} finally{ setLoading(false)}
    })()
  },[token,setTable]);
  if(loading) return <div className="mx-auto max-w-xl px-4 py-8"><Loading/></div>;
  if(err) return <div className="mx-auto max-w-xl px-4 py-8"><ErrorBox msg={err}/></div>;
  return (
    <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <div className="card p-8 text-center space-y-3">
        <div className="h-12 w-12 rounded-2xl bg-emerald-500 text-white grid place-items-center mx-auto text-xl">✓</div>
        <h1 className="text-2xl font-bold">Table Connected</h1>
        <p className="text-zinc-500">You are at <b className="text-zinc-900">{data?.label||data?.name||'Table'}</b>. Your orders will be served here.</p>
        <div className="text-xs text-zinc-400 break-all bg-zinc-50 border rounded-xl p-2">Token: {token}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/menu" className="btn btn-primary">Browse Menu</Link>
        <Link href="/cart" className="btn btn-ghost">Go to Cart</Link>
      </div>
      <button onClick={()=>router.push('/menu')} className="w-full text-sm text-zinc-500">Continue browsing →</button>
    </div>
  )
}
