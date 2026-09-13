const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

type Opts = RequestInit & { auth?: boolean };

function getToken(){ if(typeof window==='undefined') return null; return localStorage.getItem('token'); }

export async function apiFetch(path:string, opts:Opts={}){
  const headers: Record<string,string> = { 'Content-Type':'application/json', ...(opts.headers as any||{}) };
  if(opts.auth!==false){
    const t=getToken(); if(t) headers['Authorization']='Bearer '+t;
  }
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const text = await res.text();
  let data:any=null; try{ data=text?JSON.parse(text):null }catch{ data=text as any }
  if(!res.ok){
    const msg = data?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}
export const api = {
  get:(p:string,o?:Opts)=>apiFetch(p,{...o,method:'GET'}),
  post:(p:string,body?:any,o?:Opts)=>apiFetch(p,{...o,method:'POST', body: body?JSON.stringify(body):undefined}),
  put:(p:string,body?:any,o?:Opts)=>apiFetch(p,{...o,method:'PUT', body: body?JSON.stringify(body):undefined}),
  del:(p:string,o?:Opts)=>apiFetch(p,{...o,method:'DELETE'}),
  upload:(p:string, form:FormData)=> {
    const t=getToken(); const h:any={}; if(t) h['Authorization']='Bearer '+t;
    return fetch(`${API}${p}`,{method:'POST', headers:h, body:form}).then(async r=>{
      const j=await r.json().catch(()=>null); if(!r.ok) throw new Error(j?.message||'Upload failed'); return j;
    })
  }
};
export function apiUrl(p:string){ return `${API}${p}` }
