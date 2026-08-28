import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { setSupabaseGetter } from '@tubeghost/ui'
import { getSupabase } from './lib/supabase'

// Register this app's Supabase client with the shared package BEFORE the first
// render. The package's data modules read the client through this seam rather
// than importing a module directly, because each app builds its own client
// (different session persistence, different extra clients).
setSupabaseGetter(getSupabase)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary variant="fullscreen">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
)
