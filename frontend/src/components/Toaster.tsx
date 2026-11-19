import type { Toast } from '../types'

export function Toaster({ toasts, announcement }: { toasts: Toast[]; announcement: string }) {
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      <div className="pointer-events-none fixed right-4 top-16 z-[70] flex w-80 flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto rounded-lg border border-outline-variant bg-surface-container-high px-4 py-2.5 text-xs text-on-surface shadow-2xl">
            {t.message}
          </div>
        ))}
      </div>
    </>
  )
}
