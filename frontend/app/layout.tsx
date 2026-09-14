import './globals.css';
import { AuthProvider } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import { Analytics } from '@vercel/analytics/next';

export const metadata = { title:'Saffron — Restaurant OS', description:'Dine-in, order, and manage.' };

export default function RootLayout({children}:{children:React.ReactNode}){
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar/>
          <main className="min-h-[calc(100vh-64px)]">{children}</main>
          <footer className="border-t bg-white mt-12 py-8 text-center text-sm text-zinc-500">© {new Date().getFullYear()} Saffron Restaurant • Crafted for delightful dining</footer>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
