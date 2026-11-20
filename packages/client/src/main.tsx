import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { registerServiceWorker } from './registerServiceWorker.js'
import { startAppHash } from './shell/appHash.js'
import '@fontsource-variable/inter'
import './styles/app.css'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Missing #root element')
}

void registerServiceWorker()
startAppHash()

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
