'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import TableGrid from '@/components/TableGrid';
import {Loading,ErrorBox} from '@/components/UI';

export default function StaffTables(){
  const [tables,setTables]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  async function load(){ setLoading(true); setErr(''); try{ const d:any=await api.get('/tables'); setTables(d.data||d.tables||d); }catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  useEffect(()=>{ load()},[]);
  async function setStatus(id:string, status:string){
    try{ await api.put(`/tables/${id}`,{status}); load(); }catch{ try{ await api.put(`/tables/${id}/status`,{status}); load(); }catch(e:any){ alert(e.message)} }
  }
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Tables</h2>
      <TableGrid tables={tables} onSelect={t=>{
        const s=prompt(`Set status for ${t.label||t.name}: AVAILABLE / OCCUPIED / RESERVED / CLEANING`,'AVAILABLE');
        if(s) setStatus(t.id,s.toUpperCase());
      }}/>
      <p className="text-xs text-zinc-500">Click a table to update status.</p>
    </div>
  )
}
