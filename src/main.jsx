import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { logError } from './db/errorRepo.js'

// Global capture for errors outside React's tree (async, event handlers).
window.addEventListener('error', (e) => {
  logError(e.message || 'window error', { stack: e.error?.stack || null, context: e.filename })
})
window.addEventListener('unhandledrejection', (e) => {
  logError(e.reason?.message || String(e.reason) || 'unhandled rejection', {
    stack: e.reason?.stack || null,
  })
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
