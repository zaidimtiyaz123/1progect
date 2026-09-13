'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

type User = { id:string; name:string; email:string; role:'CUSTOMER'|'STAFF'|'MANAGER'|'ADMIN'; phone?:string; tableId?:string };
type Ctx = { user:User|null; token:string|null; loading:boolean; login:(email:string,password:string)=>Promise<void>; register:(data:any)=>Promise<void>; logout:()=>void; refresh:()=>Promise<void> };
const AuthCtx = createContext<Ctx>(null as any);

export function AuthProvider({children}:{children:React.ReactNode}){
  const [user,setUser]=useState<User|null>(null);
  const [token,setToken]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const t=localStorage.getItem('token');
    const u=localStorage.getItem('user');
    if(t) setToken(t);
    if(u) try{ setUser(JSON.parse(u)) }catch{}
    if(t){
      api.get('/auth/me').then((d:any)=>{ const u=d.user||d; setUser(u); localStorage.setItem('user',JSON.stringify(u)); }).catch(()=>{}).finally(()=>setLoading(false));
    } else setLoading(false);
  },[]);
  async function login(email:string,password:string){
    const d:any=await api.post('/auth/login',{email,password}, {auth:false});
    const t=d.token||d.accessToken; const u=d.user;
    localStorage.setItem('token',t); localStorage.setItem('user',JSON.stringify(u));
    setToken(t); setUser(u);
  }
  async function register(data:any){
    const d:any=await api.post('/auth/register',data,{auth:false});
    const t=d.token||d.accessToken; const u=d.user;
    if(t){ localStorage.setItem('token',t); localStorage.setItem('user',JSON.stringify(u)); setToken(t); setUser(u); }
  }
  function logout(){ localStorage.removeItem('token'); localStorage.removeItem('user'); setToken(null); setUser(null); }
  async function refresh(){
    try{ const d:any=await api.get('/auth/me'); const u=d.user||d; setUser(u); localStorage.setItem('user',JSON.stringify(u)); }catch{}
  }
  return <AuthCtx.Provider value={{user,token,loading,login,register,logout,refresh}}>{children}</AuthCtx.Provider>
}
export const useAuth=()=>useContext(AuthCtx);
