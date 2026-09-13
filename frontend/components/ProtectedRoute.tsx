'use client';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProtectedRoute({children, roles}:{children:React.ReactNode; roles?: string[]}){
  const {user,loading}=useAuth();
  const router=useRouter();
  useEffect(()=>{
    if(!loading && !user) router.push('/login');
    if(!loading && user && roles && !roles.includes(user.role)) router.push('/');
  },[user,loading,roles,router]);
  if(loading) return <div className="p-8 text-center text-zinc-500">Checking access…</div>;
  if(!user) return null;
  if(roles && !roles.includes(user.role)) return <div className="p-8 text-center">Not authorized.</div>;
  return <>{children}</>
}
