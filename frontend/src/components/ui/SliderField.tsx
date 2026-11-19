import * as Slider from '@radix-ui/react-slider'

export function SliderField({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  disabled?: boolean
}) {
  return (
    <Slider.Root
      className="relative flex h-5 w-full touch-none select-none items-center data-[disabled]:opacity-45"
      value={[value]}
      min={1}
      max={100}
      step={1}
      disabled={disabled}
      onValueChange={([v]) => onChange(v)}
    >
      <Slider.Track className="relative h-1 grow rounded-full border border-outline-variant/60 bg-surface-container-high">
        <Slider.Range className="absolute h-full rounded-full bg-gradient-to-r from-primary-container to-[#6366f1]" />
      </Slider.Track>
      <Slider.Thumb
        aria-label={label}
        className="block h-3.5 w-3.5 rounded-full border border-primary bg-on-surface shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-[width,height] hover:h-4 hover:w-4 active:h-4 active:w-4"
      />
    </Slider.Root>
  )
}
