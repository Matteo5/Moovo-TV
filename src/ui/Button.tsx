import React from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg' | 'sm'

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-brand font-bold shadow-[0_0.75rem_2rem_-0.75rem_rgb(255_62_165/0.55)]',
  secondary: 'bg-ink-800 text-paper hover:bg-ink-700 border border-white/8 font-semibold',
  ghost: 'text-mist hover:text-paper hover:bg-white/6 font-semibold',
  danger: 'bg-onair/15 text-onair hover:bg-onair/25 border border-onair/30 font-semibold',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  md: 'h-11 px-5 text-[0.95rem] gap-2.5 rounded-xl',
  lg: 'h-14 px-7 text-lg gap-3 rounded-2xl',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon, className = '', children, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center whitespace-nowrap transition-[background-color,filter,color] duration-150 disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
)
Button.displayName = 'Button'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const ICON_SIZES = { sm: 'size-9 rounded-lg', md: 'size-11 rounded-xl', lg: 'size-14 rounded-2xl' }

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, active, size = 'md', className = '', children, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center justify-center transition-colors duration-150 ${ICON_SIZES[size]} ${
        active ? 'bg-accent text-accent-ink' : 'bg-white/6 text-paper hover:bg-white/12'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
)
IconButton.displayName = 'IconButton'

export const Chip: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; count?: number }
> = ({ selected, count, className = '', children, type = 'button', ...rest }) => (
  <button
    type={type}
    aria-pressed={selected}
    className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
      selected ? 'bg-paper text-ink-950' : 'bg-ink-800 text-mist hover:text-paper hover:bg-ink-700'
    } ${className}`}
    {...rest}
  >
    {children}
    {count !== undefined && (
      <span className={`font-mono text-xs tabular ${selected ? 'text-ink-700' : 'text-fog'}`}>{count}</span>
    )}
  </button>
)
