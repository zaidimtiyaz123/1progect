'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {Loading,ErrorBox} from '@/components/UI';

export default function StaffMgmt(){
  const [staff,setStaff]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [form,setForm]=useState({name:'',email:'',password:'',role:'STAFF'});
  async function load(){
    setLoading(true); setErr('');
    try{ const d:any=await api.get('/users'); const list=d.data||d.users||d; setStaff(Array.isArray(list)?list.filter((u:any)=>['STAFF','MANAGER','ADMIN'].includes(u.role)):[]); }
    catch{ try{ const d:any=await api.get('/staff'); setStaff(d.data||d.staff||[])}catch(e:any){ setErr(e.message)} }
    finally{ setLoading(false)}
  }
  useEffect(()=>{ load()},[]);
  async function create(e:React.FormEvent){
    e.preventDefault();
    try{ await api.post('/users',{...form}); try{ await api.post('/auth/register',form); }catch{} setForm({name:'',email:'',password:'',role:'STAFF'}); load(); }catch(e:any){ try{ await api.post('/staff',form); load(); }catch(er:any){ alert(er.message)} }
  }
  async function del(id:string){ if(!confirm('Remove staff?'))return; try{ await api.del(`/users/${id}`); load(); }catch(e:any){ alert(e.message)} }
  if(loading) return <Loading/>; if(err) return <ErrorBox msg={err} onRetry={load}/>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Staff</h2>
      <form onSubmit={create} className="card p-4 grid md:grid-cols-4 gap-2">
        <input placeholder="Name" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="input"/>
        <input placeholder="Email" type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="input"/>
        <input placeholder="Password" type="password" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="input"/>
        <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} className="input"><option>STAFF</option><option>MANAGER</option><option>ADMIN</option></select>
        <button className="btn btn-primary md:col-span-4">Add Staff</button>
      </form>
      <div className="space-y-2">
        {staff.map((s:any)=>{
          const id=s.id||s._id;
          return <div key={id} className="card p-3 flex justify-between items-center"><div><div className="font-medium">{s.name} <span className="badge bg-zinc-100 border ml-2">{s.role}</span></div><div className="text-xs text-zinc-500">{s.email}</div></div><button onClick={()=>del(id)} className="text-xs text-red-600">Remove</button></div>
        })}
        {staff.length===0 && <div className="text-sm text-zinc-500 text-center py-6">No staff found.</div>}
      </div>
    </div>
  )
}
