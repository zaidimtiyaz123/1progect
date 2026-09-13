'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {useAuth} from '@/lib/auth';

export default function Register(){
  const [form,setForm]=useState({name:'',email:'',password:'',phone:''}); const [err,setErr]=useState(''); const [loading,setLoading]=useState(false);
  const {register}=useAuth(); const router=useRouter();
  async function submit(e:React.FormEvent){ e.preventDefault(); setErr(''); setLoading(true); try{ await register(form); router.push('/'); }catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-8 space-y-6">
        <div><h1 className="text-2xl font-bold">Create account</h1><p className="text-sm text-zinc-500">Join Saffron for faster ordering.</p></div>
        <form onSubmit={submit} className="space-y-3">
          <input placeholder="Full name" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="input"/>
          <input placeholder="Email" type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="input"/>
          <input placeholder="Phone (optional)" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="input"/>
          <input placeholder="Password" type="password" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="input"/>
          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{err}</div>}
          <button disabled={loading} className="btn btn-primary w-full">{loading?'Creating…':'Create account'}</button>
        </form>
        <p className="text-sm text-center text-zinc-500">Have an account? <Link href="/login" className="text-orange-600 font-medium">Login</Link></p>
      </div>
    </div>
  )
}
