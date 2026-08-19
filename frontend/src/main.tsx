import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { AppRoot } from './AppRoot.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { registerServiceWorker } from './pwa/registerServiceWorker.ts'

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoot />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
