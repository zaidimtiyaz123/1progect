'use client';
import {useAuth} from '@/lib/auth';
import ProtectedRoute from '@/components/ProtectedRoute';
import {useState} from 'react';
import {api} from '@/lib/api';

export default function ProfilePage(){ return <ProtectedRoute><Inner/></ProtectedRoute> }
function Inner(){
  const {user,refresh}=useAuth();
  const [form,setForm]=useState({name:user?.name||'', phone:(user as any)?.phone||''});
  const [msg,setMsg]=useState(''); const [saving,setSaving]=useState(false);
  async function save(){
    setSaving(true); setMsg('');
    try{ await api.put('/users/me',{...form}); await api.put('/auth/me',{...form}).catch(()=>{}); await refresh(); setMsg('Profile updated'); }catch(e:any){ try{ await api.put('/profile',form); setMsg('Profile updated'); }catch(er:any){ setMsg(er.message)} } finally{ setSaving(false)}
  }
  return (
    <div className="mx-auto max-w-xl px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-zinc-900 text-white grid place-items-center text-xl font-bold">{user?.name?.[0]}</div>
          <div><div className="font-semibold">{user?.name}</div><div className="text-sm text-zinc-500">{user?.email} • {user?.role}</div></div>
        </div>
        <label className="block space-y-1"><span className="text-sm font-medium">Name</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="input"/></label>
        <label className="block space-y-1"><span className="text-sm font-medium">Phone</span><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="input"/></label>
        {msg && <div className="text-sm p-2 rounded-xl bg-zinc-50 border">{msg}</div>}
        <button onClick={save} disabled={saving} className="btn btn-primary w-full">{saving?'Saving…':'Save changes'}</button>
      </div>
    </div>
  )
}
