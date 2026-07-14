// SlideToConfirm — ported from v1 in spirit (DESIGN §2/§3). Destructive or
// irreversible FIELD actions (finish job, end route) use this, never a bare
// tap. Drag the knob past ~85% of the track to fire onConfirm.

import { useRef, useState } from 'react'

export function SlideToConfirm({ label = 'Slide to confirm', onConfirm, color = 'var(--green)' }) {
  const trackRef = useRef(null)
  const [pct, setPct] = useState(0)
  const [dragging, setDragging] = useState(false)

  const clientXFrom = (e) => (e.touches ? e.touches[0].clientX : e.clientX)

  const move = (e) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const knob = 56
    const usable = rect.width - knob
    const x = Math.min(Math.max(clientXFrom(e) - rect.left - knob / 2, 0), usable)
    setPct(usable > 0 ? x / usable : 0)
  }

  const end = () => {
    setDragging(false)
    setPct((p) => {
      if (p >= 0.85) {
        onConfirm?.()
        return 0
      }
      return 0
    })
  }

  const start = (e) => {
    setDragging(true)
    move(e)
  }

  return (
    <div
      ref={trackRef}
      className="slide-track"
      onPointerMove={dragging ? move : undefined}
      onPointerUp={end}
      onPointerLeave={dragging ? end : undefined}
      style={{
        position: 'relative',
        height: 56,
        borderRadius: 999,
        background: 'var(--bg-inset)',
        userSelect: 'none',
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontWeight: 600,
          opacity: 1 - pct,
        }}
      >
        {label} →
      </div>
      <div
        onPointerDown={start}
        style={{
          position: 'absolute',
          top: 4,
          width: 48,
          height: 48,
          borderRadius: 999,
          background: color,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          left: `calc(4px + ${pct} * (100% - 56px))`,
          cursor: 'grab',
          transition: dragging ? 'none' : 'left 150ms',
        }}
      >
        ✓
      </div>
    </div>
  )
}
