'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading} from '@/components/UI';

export default function Settings(){
  const [form,setForm]=useState({restaurantName:'Saffron',currency:'INR',taxRate:'5',address:'',phone:''});
  const [msg,setMsg]=useState(''); const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{
    try{ const d:any=await api.get('/settings'); const s=d.data||d.settings||d; setForm(prev=> ({...prev, ...s})); }catch{} finally{ setLoading(false)}
  })()},[]);
  async function save(){
    setMsg('');
    try{ await api.put('/settings',form); setMsg('Settings saved'); }catch(e:any){ try{ await api.post('/settings',form); setMsg('Settings saved'); }catch(er:any){ setMsg(er.message)} }
  }
  if(loading) return <Loading/>;
  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-bold">Settings</h2>
      <div className="card p-6 space-y-4">
        <label className="block space-y-1"><span className="text-sm font-medium">Restaurant Name</span><input value={form.restaurantName} onChange={e=>setForm({...form,restaurantName:e.target.value})} className="input"/></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1"><span className="text-sm font-medium">Currency</span><input value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})} className="input"/></label>
          <label className="block space-y-1"><span className="text-sm font-medium">Tax Rate %</span><input value={form.taxRate} onChange={e=>setForm({...form,taxRate:e.target.value})} className="input"/></label>
        </div>
        <label className="block space-y-1"><span className="text-sm font-medium">Address</span><input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} className="input"/></label>
        <label className="block space-y-1"><span className="text-sm font-medium">Phone</span><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="input"/></label>
        {msg && <div className="text-sm p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">{msg}</div>}
        <button onClick={save} className="btn btn-primary">Save Settings</button>
      </div>
    </div>
  )
}
