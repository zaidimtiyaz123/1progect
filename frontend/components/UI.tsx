export function Loading(){ return <div className="p-8 text-center animate-pulse text-zinc-500">Loading…</div> }
export function ErrorBox({msg,onRetry}:{msg:string; onRetry?:()=>void}){
  return <div className="card p-6 text-center"><div className="text-red-600 font-medium">{msg}</div>{onRetry && <button onClick={onRetry} className="btn btn-primary mt-3">Retry</button>}</div>
}
export function Empty({title,desc,action}:{title:string; desc?:string; action?:React.ReactNode}){
  return <div className="card p-10 text-center"><h3 className="font-semibold">{title}</h3>{desc && <p className="text-sm text-zinc-500 mt-1">{desc}</p>}{action && <div className="mt-4">{action}</div>}</div>
}
export function Section({title,subtitle,children,action}:{title:string; subtitle?:string; children:React.ReactNode; action?:React.ReactNode}){
  return <section className="space-y-4"><div className="flex items-end justify-between gap-4"><div><h2 className="text-xl font-bold tracking-tight">{title}</h2>{subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}</div>{action}</div>{children}</section>
}
