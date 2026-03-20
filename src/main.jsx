import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

function applyFxMode() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const nav = window.navigator
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const narrowViewport = window.innerWidth <= 1180 || window.innerHeight <= 820
  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4
  const lowCpu = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4
  const liteFx = prefersReducedMotion || lowMemory || lowCpu || (coarsePointer && narrowViewport)

  document.documentElement.dataset.fxMode = liteFx ? 'lite' : 'full'
}

applyFxMode()
if (!window.__cardBattlerFxModeListenerAttached) {
  window.addEventListener('resize', applyFxMode, { passive: true })
  window.__cardBattlerFxModeListenerAttached = true
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
