// Banner — full-width alert. GPS-lost, overlap warning, unsaved changes
// (DESIGN §3). variant: 'info' | 'warn' | 'error'.

export function Banner({ variant = 'info', icon, children }) {
  return (
    <div className={`banner banner--${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </div>
  )
}
