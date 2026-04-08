'use client'

import type { Alert } from '@/lib/types'

const SEVERITY_STYLES = {
  info:        'bg-blue-50 border-blue-200 text-blue-800',
  warning:     'bg-amber-50 border-amber-200 text-amber-800',
  disruption:  'bg-red-50 border-red-200 text-red-800',
}

const SEVERITY_ICON = {
  info: 'ℹ️',
  warning: '⚠️',
  disruption: '🚨',
}

interface Props {
  alerts: Alert[]
}

export function AlertBanner({ alerts }: Props) {
  if (alerts.length === 0) return null

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`rounded-xl border p-3 ${SEVERITY_STYLES[alert.severity]}`}
        >
          <p className="font-semibold text-sm">
            {SEVERITY_ICON[alert.severity]} {alert.title}
          </p>
          {alert.description && (
            <p className="text-xs mt-1 leading-relaxed">{alert.description}</p>
          )}
          {alert.url && (
            <a
              href={alert.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline mt-1 inline-block"
            >
              More info
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
