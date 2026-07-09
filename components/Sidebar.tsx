'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ClipboardList, FileText, DollarSign } from 'lucide-react'

const navItems = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { href: '/casos',     label: 'Casos',     icon: ClipboardList   },
  { href: '/facturas',  label: 'Facturas',  icon: FileText        },
  { href: '/cobros',    label: 'Cobros',    icon: DollarSign      },
]

export default function Sidebar() {
  const pathname = usePathname()

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      pathname === href
        ? 'bg-green-600 text-white'
        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
    }`

  return (
    <>
      {/* ── Desktop: columna lateral ── */}
      <aside className="hidden md:flex flex-col w-56 min-h-screen bg-zinc-900 flex-shrink-0">
        <div className="px-5 py-5 border-b border-zinc-800">
          <p className="text-white font-bold text-base leading-tight">🚦 Taller</p>
          <p className="text-green-400 font-semibold text-base leading-tight">El Semáforo</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 mt-2">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={linkClass(href)}>
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-zinc-800">
          <p className="text-zinc-500 text-xs">v0.1.0</p>
        </div>
      </aside>

      {/* ── Mobile: barra superior fija ── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-zinc-900 h-14 flex items-center px-4 shadow-lg">
        <span className="text-white font-bold flex-1 text-sm">🚦 Taller El Semáforo</span>
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={label}
              className={`p-2 rounded-lg transition-colors ${
                pathname === href
                  ? 'bg-green-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
            </Link>
          ))}
        </nav>
      </header>
    </>
  )
}
