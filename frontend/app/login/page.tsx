'use client';
import {useState, Suspense} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {useAuth} from '@/lib/auth';

export const dynamic = 'force-dynamic';

function LoginInner(){
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [err,setErr]=useState(''); const [loading,setLoading]=useState(false);
  const {login}=useAuth(); const router=useRouter(); const sp=useSearchParams(); const next=sp.get('next')||'/';
  async function submit(e:React.FormEvent){ e.preventDefault(); setErr(''); setLoading(true); try{ await login(email,password); router.push(next);}catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-8 space-y-6">
        <div><h1 className="text-2xl font-bold">Welcome back</h1><p className="text-sm text-zinc-500">Login to continue ordering and managing.</p></div>
        <form onSubmit={submit} className="space-y-4">
          <input placeholder="Email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="input"/>
          <input placeholder="Password" type="password" required value={password} onChange={e=>setPassword(e.target.value)} className="input"/>
          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{err}</div>}
          <button disabled={loading} className="btn btn-primary w-full">{loading?'Signing in…':'Sign in'}</button>
        </form>
        <p className="text-sm text-center text-zinc-500">No account? <Link href="/register" className="text-orange-600 font-medium">Create one</Link></p>
        <div className="text-xs text-zinc-400 text-center">Demo: manager@saffron.test / manager123 • staff@saffron.test / staff123</div>
      </div>
    </div>
  )
}
export default function Login(){
  return <Suspense fallback={<div className="p-8 text-center text-zinc-500">Loading…</div>}><LoginInner/></Suspense>
}
