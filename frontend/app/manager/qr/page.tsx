'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox} from '@/components/UI';

export default function QRPage(){
  const [tables,setTables]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  async function load(){
    setLoading(true); setErr('');
    try{
      const d:any=await api.get('/tables');
      const list=d.data||d.tables||d;
      setTables(Array.isArray(list)?list:[]);
    }catch(e:any){ setErr(e.message)} finally{ setLoading(false)}
  }
  useEffect(()=>{ load()},[]);
  async function regen(id:string){
    try{ await api.post(`/tables/${id}/qr`); load(); }catch{ try{ await api.post(`/qr/generate`,{tableId:id}); load(); }catch(e:any){ alert(e.message)} }
  }
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">QR Codes</h2>
      <p className="text-sm text-zinc-500">Each table has a QR that links to /t/[token] for instant ordering.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tables.map((t:any)=>{
          const id=t.id||t._id; const token=t.qrToken||t.token||id;
          const url = typeof window!=='undefined' ? `${window.location.origin}/t/${token}` : `/t/${token}`;
          const qrImg=`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
          return (
            <div key={id} className="card p-4 text-center space-y-3">
              <div className="font-semibold">{t.label||t.name||id.slice(0,8)}</div>
              <img src={qrImg} alt="QR" className="mx-auto h-44 w-44 border rounded-xl"/>
              <div className="text-xs break-all bg-zinc-50 border rounded-lg p-2">{url}</div>
              <button onClick={()=>regen(id)} className="btn btn-ghost w-full text-xs">Regenerate</button>
              <a href={qrImg} download className="btn btn-primary w-full text-xs">Download QR</a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
