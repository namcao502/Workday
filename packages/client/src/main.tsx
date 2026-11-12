import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles/tokens.css'
import './styles/controls.css'
import './styles/shell.css'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Missing #root element')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
