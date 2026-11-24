import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/schibsted-grotesk'
import '@fontsource/big-shoulders-display/latin-700'
import '@fontsource/big-shoulders-display/latin-800'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
