import { type ReactNode } from 'react'

type Color = 'blue' | 'amber' | 'green' | 'purple'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  color?: Color
}

const colorMap: Record<Color, string> = {
  blue:   'bg-blue-50   text-blue-600   border-blue-100',
  amber:  'bg-amber-50  text-amber-600  border-amber-100',
  green:  'bg-green-50  text-green-600  border-green-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
}

export default function StatCard({ title, value, subtitle, icon, color = 'blue' }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
        <div className={`p-2 rounded-xl border ${colorMap[color]}`}>
          {icon}
        </div>
      </div>

      <div>
        <p className="text-3xl font-bold text-gray-900 leading-none">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}
