import StatCard from '@/components/StatCard'
import { ClipboardList, FileText, CreditCard, Wallet } from 'lucide-react'

export default function DashboardPage() {
  const mes = new Date().toLocaleString('es-AR', { month: 'long', year: 'numeric' })

  return (
    <div className="max-w-5xl mx-auto">
      {/* Encabezado */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Panel de control</h1>
        <p className="text-gray-400 text-sm mt-1 capitalize">{mes}</p>
      </div>

      {/* Tarjetas de resumen */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
          Resumen general
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Casos activos"
            value={0}
            subtitle="En proceso en el taller"
            icon={<ClipboardList size={18} strokeWidth={1.75} />}
            color="blue"
          />
          <StatCard
            title="Facturas sin cobrar"
            value={0}
            subtitle="Emitidas y pendientes"
            icon={<FileText size={18} strokeWidth={1.75} />}
            color="amber"
          />
          <StatCard
            title="Cobrado este mes"
            value="$0"
            subtitle="Facturado + efectivo"
            icon={<CreditCard size={18} strokeWidth={1.75} />}
            color="green"
          />
          <StatCard
            title="Efectivo este mes"
            value="$0"
            subtitle="Solo cobros en efectivo"
            icon={<Wallet size={18} strokeWidth={1.75} />}
            color="purple"
          />
        </div>
      </section>

      {/* Placeholder tabla de casos recientes */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
          Casos recientes
        </h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
          Los casos aparecerán acá una vez que empieces a cargar datos.
        </div>
      </section>
    </div>
  )
}
