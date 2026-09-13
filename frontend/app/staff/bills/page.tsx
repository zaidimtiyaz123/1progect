'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox,Empty} from '@/components/UI';

export default function Bills(){
  const [bills,setBills]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  async function load(){
    setLoading(true); setErr('');
    try{ const d:any=await api.get('/bills'); const list=d.bills||d.data||d; setBills(Array.isArray(list)?list:[])}catch{
      try{ const d:any=await api.get('/orders'); const list=d.data||d.orders||d; setBills((Array.isArray(list)?list:[]).filter((o:any)=>['SERVED','READY','PAID'].includes((o.status||'').toUpperCase())))}
      catch(e:any){ setErr(e.message)}
    } finally{ setLoading(false)}
  }
  useEffect(()=>{ load()},[]);
  async function settle(id:string){
    try{ await api.post(`/bills/${id}/pay`,{method:'CASH'}); load(); }catch{
      try{ await api.put(`/orders/${id}/status`,{status:'PAID'}); load(); }catch(e:any){ alert(e.message)}
    }
  }
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  if(!bills.length) return <Empty title="No bills" desc="Served orders will appear here for settlement."/>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Bills</h2>
      {bills.map((b:any)=>{
        const id=b.id||b._id;
        return (
          <div key={id} className="card p-4 flex items-center justify-between">
            <div><div className="font-semibold">Bill #{String(id).slice(0,8).toUpperCase()}</div><div className="text-sm text-zinc-500">Total ₹{b.total||b.totalAmount||'-'} • {b.status||'DUE'}</div></div>
            <button onClick={()=>settle(id)} className="btn btn-primary">Mark Paid</button>
          </div>
        )
      })}
    </div>
  )
}
