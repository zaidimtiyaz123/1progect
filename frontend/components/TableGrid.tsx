'use client';
type Table={id:string; label?:string; number?:number; name?:string; capacity?:number; status?:string; seats?:number};
export default function TableGrid({tables,onSelect}:{tables:Table[]; onSelect?:(t:Table)=>void}){
  if(!tables?.length) return <div className="card p-8 text-center text-zinc-500">No tables found.</div>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {tables.map(t=>{
        const label=t.label||t.name||`T-${t.number||t.id.slice(0,4)}`;
        const cap=t.capacity||t.seats||2;
        const status=(t.status||'AVAILABLE').toUpperCase();
        const color=status==='AVAILABLE'?'border-emerald-200 bg-emerald-50': status==='OCCUPIED'?'border-red-200 bg-red-50':'border-amber-200 bg-amber-50';
        return (
          <button key={t.id} onClick={()=>onSelect?.(t)} className={`card p-4 text-left hover:shadow-md transition border-2 ${color}`}>
            <div className="font-bold">{label}</div>
            <div className="text-xs text-zinc-600">{cap} seats</div>
            <span className="badge mt-2 bg-white border">{status}</span>
          </button>
        )
      })}
    </div>
  )
}
