import Link from 'next/link';

export default function Home(){
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 md:py-24 grid md:grid-cols-2 gap-8 items-center">
          <div className="text-white space-y-6">
            <span className="inline-flex bg-white/20 backdrop-blur rounded-full px-3 py-1 text-xs font-semibold tracking-wide">NEW SEASON MENU • DINE-IN & QR ORDER</span>
            <h1 className="text-4xl md:text-5xl font-black leading-[0.95]">Fine dining,<br/>made effortless.</h1>
            <p className="text-white/90 max-w-lg">Scan a table QR to order instantly, book tables, track live orders, and let staff orchestrate service — all in one OS.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/menu" className="btn bg-white text-zinc-900 hover:bg-zinc-100">Browse Menu →</Link>
              <Link href="/book" className="btn bg-zinc-900 text-white hover:bg-black">Book a Table</Link>
            </div>
            <div className="flex gap-6 pt-2 text-sm">
              <div><div className="font-bold text-lg">4.8★</div><div className="text-white/70">2k+ reviews</div></div>
              <div><div className="font-bold text-lg">30 min</div><div className="text-white/70">avg. serve time</div></div>
              <div><div className="font-bold text-lg">QR</div><div className="text-white/70">instant ordering</div></div>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="card p-2 rotate-1 shadow-2xl">
              <img src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80" alt="restaurant" className="rounded-xl h-[360px] w-full object-cover"/>
              <div className="p-4 flex items-center justify-between">
                <div><div className="font-semibold">Chef\'s Tasting Table</div><div className="text-sm text-zinc-500">Tonight 7:30 PM • 4 guests</div></div>
                <Link href="/book" className="btn btn-primary !py-2">Reserve</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 grid md:grid-cols-3 gap-4">
        {[
          {t:'Scan & Order',d:'QR on each table links your session for instant ordering without waiting.',icon:'📱'},
          {t:'Live Kitchen',d:'Orders flow to kitchen display with real-time status via WebSocket.',icon:'🍳'},
          {t:'Smart Billing',d:'Split, discount, and settle bills — manager gets full reports.',icon:'🧾'},
        ].map(c=>(
          <div key={c.t} className="card p-6">
            <div className="h-10 w-10 grid place-items-center rounded-xl bg-orange-50 text-lg">{c.icon}</div>
            <h3 className="font-semibold mt-3">{c.t}</h3>
            <p className="text-sm text-zinc-500 mt-1">{c.d}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-10">
        <div className="card p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-4 bg-zinc-900 text-white border-zinc-900">
          <div><h3 className="font-bold text-xl">Are you staff or manager?</h3><p className="text-sm text-zinc-400">Access operations dashboards for tables, orders, and analytics.</p></div>
          <div className="flex gap-3">
            <Link href="/staff" className="btn bg-white text-zinc-900">Staff Dashboard</Link>
            <Link href="/manager" className="btn bg-orange-600 text-white">Manager Console</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
