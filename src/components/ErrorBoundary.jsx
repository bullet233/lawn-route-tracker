// App-wide error boundary (SPEC §3). Catches render/runtime errors, logs them
// to the errorLog table, and shows a recoverable fallback instead of a white
// screen — critical in the field where a crash could lose the day's tracking.

import { Component } from 'react'
import { logError } from '../db/errorRepo.js'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    logError(error?.message || 'Render error', {
      stack: error?.stack || null,
      context: info?.componentStack || null,
    })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-shell">
          <div className="card card--red" style={{ marginTop: 24 }}>
            <strong style={{ fontSize: 'var(--fs-card)' }}>Something went wrong</strong>
            <p style={{ color: 'var(--text-muted)' }}>
              The error was logged (Settings → error log). Your data is safe in the database.
            </p>
            <p style={{ fontFamily: 'monospace', fontSize: 'var(--fs-small)', color: 'var(--red)' }}>
              {String(this.state.error.message || this.state.error)}
            </p>
            <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
