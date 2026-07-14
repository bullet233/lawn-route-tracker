// PrimaryBar — bottom-anchored full-width action button for field screens
// (DESIGN §3, sits above the tab bar). Destructive field actions should use
// SlideToConfirm instead of this bare button.

export function PrimaryBar({ label, onClick, disabled, variant = 'primary', children }) {
  return (
    <div className="primary-bar">
      {children ?? (
        <button type="button" className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>
          {label}
        </button>
      )}
    </div>
  )
}
