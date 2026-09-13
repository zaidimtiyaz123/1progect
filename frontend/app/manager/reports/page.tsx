'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox} from '@/components/UI';

export default function Reports(){
  const [data,setData]=useState<any>(null); const [err,setErr]=useState(''); const [loading,setLoading]=useState(true);
  const [range,setRange]=useState('7d');
  async function load(){
    setLoading(true); setErr('');
    try{
      let d:any=null;
      try{ d=await api.get(`/reports?range=${range}`);}catch{ try{ d=await api.get(`/reports/summary?range=${range}`);}catch{ d=await api.get('/reports/dashboard');}}
      setData(d.data||d);
    }catch(e:any){ setErr(e.message)} finally{ setLoading(false)}
  }
  useEffect(()=>{ load()},[range]);
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Reports</h2>
        <select value={range} onChange={e=>setRange(e.target.value)} className="input !w-auto"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card p-6"><div className="text-sm text-zinc-500">Total Revenue</div><div className="text-2xl font-black">₹{data?.totalRevenue||data?.revenue||0}</div></div>
        <div className="card p-6"><div className="text-sm text-zinc-500">Total Orders</div><div className="text-2xl font-black">{data?.totalOrders||data?.orders||0}</div></div>
        <div className="card p-6"><div className="text-sm text-zinc-500">Expenses</div><div className="text-2xl font-black">₹{data?.totalExpenses||data?.expenses||0}</div></div>
      </div>
      {data?.topItems && (
        <div className="card p-6">
          <h3 className="font-semibold">Top Selling Items</h3>
          <div className="mt-3 space-y-2 text-sm">
            {(data.topItems||[]).map((it:any,i:number)=><div key={i} className="flex justify-between border-b py-2"><span>{it.name||it._id}</span><span className="font-medium">{it.count||it.totalQty} sold</span></div>)}
          </div>
        </div>
      )}
      <div className="card p-6">
        <h3 className="font-semibold">Raw Data</h3>
        <pre className="text-xs bg-zinc-50 border rounded-xl p-3 mt-2 overflow-auto max-h-[400px]">{JSON.stringify(data,null,2)}</pre>
      </div>
    </div>
  )
}
