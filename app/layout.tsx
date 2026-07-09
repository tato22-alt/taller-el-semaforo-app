import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Taller El Semáforo',
  description: 'Sistema de gestión del taller',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <div className="flex min-h-screen">
          <Sidebar />
          {/* pt-14 en mobile para la barra superior fija; 0 en desktop donde la sidebar ocupa columna */}
          <main className="flex-1 min-w-0 pt-14 md:pt-0 p-4 md:p-8 bg-gray-50">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
