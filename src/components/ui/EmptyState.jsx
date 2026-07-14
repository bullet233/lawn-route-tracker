// EmptyState — dashed-border card, one sentence, optional CTA (DESIGN §3).

export function EmptyState({ children, cta, onCta }) {
  return (
    <div className="empty-state">
      <p style={{ margin: 0 }}>{children}</p>
      {cta && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 'calc(var(--space) * 3)' }}
          onClick={onCta}
        >
          {cta}
        </button>
      )}
    </div>
  )
}
