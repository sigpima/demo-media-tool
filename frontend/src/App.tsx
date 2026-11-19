import { CloudUpload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AssetGrid } from './components/AssetGrid'
import { ComparePanel } from './components/ComparePanel'
import { DemoBar } from './components/DemoBar'
import { Inspector } from './components/Inspector'
import { Sidebar } from './components/Sidebar'
import { StatusPanel } from './components/StatusPanel'
import { Toaster } from './components/Toaster'
import { Toolbar } from './components/Toolbar'
import { TopBar } from './components/TopBar'
import { UploadZone } from './components/UploadZone'
import { ACCEPTED_MIME } from './lib/constants'
import { useI18n } from './i18n'
import { useBatch } from './state/useBatch'
import { useConfig } from './state/useConfig'
import { usePresets } from './state/usePresets'
import type { Phase } from './types'

const showDemo = import.meta.env.DEV || new URLSearchParams(location.search).has('demo')
const batchName = `creative_batch_${new Date().toISOString().slice(0, 10).replaceAll('-', '_')}`

export default function App() {
  const { t } = useI18n()
  const { config, limits, refresh } = useConfig()
  const batch = useBatch(limits, t, refresh)
  const presets = usePresets()
  const { phase } = batch
  const fileInput = useRef<HTMLInputElement>(null)
  const [recipeOpen, setRecipeOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  // Dev/demo only: /?demo&state=partial opens a given UI state directly.
  useEffect(() => {
    const s = new URLSearchParams(location.search).get('state') as Phase | null
    if (showDemo && s) batch.showDemo(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sidebar "Presets": show the recipe (a slide-over below 1200px), scroll to the section and focus its selected tab.
  const openPresets = useCallback(() => {
    setRecipeOpen(true)
    requestAnimationFrame(() => {
      const section = document.getElementById('presets-section')
      const box = section?.closest('fieldset') // scroll only the recipe list; scrollIntoView would also move the whole page
      if (section && box) box.scrollTo({ top: box.scrollTop + section.getBoundingClientRect().top - box.getBoundingClientRect().top - 16, behavior: 'smooth' })
      const tab = section?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')
      tab?.focus({ preventScroll: true })
      if (document.activeElement !== tab) section?.focus({ preventScroll: true }) // tabs are disabled while a batch is processing
    })
  }, [])

  const browse = useCallback(() => fileInput.current?.click(), [])
  const busy = phase === 'processing' || phase === 'uploading'

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (!busy) batch.addFiles(Array.from(e.dataTransfer.files))
  }
  const compare = (id: string) => {
    batch.inspect(id)
    requestAnimationFrame(() => document.getElementById('compare-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  return (
    <div className="relative flex h-screen flex-col overflow-clip bg-surface-container-lowest text-on-surface selection:bg-primary/30 selection:text-white">
      <TopBar phase={phase} batchName={batchName} guest={config?.role === 'guest' ? config : undefined} recipeOpen={recipeOpen} onToggleRecipe={() => setRecipeOpen((o) => !o)} />

      <div className="flex min-h-0 flex-1">
        <Sidebar onOpenPresets={openPresets} />

        <main
          className="relative flex min-w-0 flex-1 flex-col overflow-y-auto"
          onDragEnter={(e) => { e.preventDefault(); dragDepth.current++; setDragging(true) }}
          onDragLeave={() => { if (--dragDepth.current <= 0) setDragging(false) }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <Toolbar phase={phase} count={batch.assets.length} totalBytes={batch.totalBytes} settings={batch.settings} onBrowse={browse} onClear={batch.clearAll} />

          <div className="flex max-w-7xl flex-col gap-6 p-6 pb-24">
            <StatusPanel batch={batch} />
            {phase === 'empty' ? (
              <UploadZone large limits={limits} onBrowse={browse} onDemo={showDemo ? () => batch.showDemo('ready') : undefined} />
            ) : (
              <UploadZone large={false} limits={limits} onBrowse={browse} />
            )}
            <AssetGrid batch={batch} onCompare={compare} />
            <ComparePanel batch={batch} />
          </div>

          {dragging && !busy && (
            <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-surface/80 backdrop-blur-sm">
              <div className="flex items-center gap-3 text-sm font-medium text-white">
                <CloudUpload className="h-6 w-6 text-primary" aria-hidden /> {t('app.drop')}
              </div>
            </div>
          )}
        </main>

        <Inspector batch={batch} presets={presets} open={recipeOpen} onClose={() => { setRecipeOpen(false); document.querySelector<HTMLElement>('button[aria-controls=recipe-panel]')?.focus() }} />
      </div>

      <input
        ref={fileInput} type="file" multiple hidden accept={ACCEPTED_MIME.join(',')}
        onChange={(e) => { batch.addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
      />
      <Toaster toasts={batch.toasts} announcement={batch.announcement} />
      {showDemo && <DemoBar phase={phase} onPick={batch.showDemo} />}
    </div>
  )
}
