// Modal — the ONE modal shell (DESIGN §3): max-height 90vh, internal scroll,
// sticky action row. Bottom-sheet on phones, centered on wider screens.

export function Modal({ title, onClose, children, actions }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {title && (
          <div className="modal__actions" style={{ borderTop: 'none', borderBottom: '1px solid var(--border)', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 'var(--fs-card)' }}>{title}</strong>
            <button type="button" className="btn btn-secondary" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        )}
        <div className="modal__body">{children}</div>
        {actions && <div className="modal__actions">{actions}</div>}
      </div>
    </div>
  )
}
