import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { seedIfEmpty } from './db'
import './index.css'
import App from './App.tsx'

void seedIfEmpty().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
