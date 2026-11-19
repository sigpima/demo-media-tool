import * as Switch from '@radix-ui/react-switch'
import { useId } from 'react'

export function SwitchField({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className="text-xs text-on-surface-variant">
        <span className="block text-on-surface">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
      </label>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full border border-outline-variant bg-surface-container-high transition-colors data-[state=checked]:border-primary-container data-[state=checked]:bg-primary-container"
      >
        <Switch.Thumb className="block h-3.5 w-3.5 translate-x-[3px] rounded-full bg-white transition-transform data-[state=checked]:translate-x-[19px]" />
      </Switch.Root>
    </div>
  )
}
