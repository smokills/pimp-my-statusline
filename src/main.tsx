import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts — side-effect imports of only the weights we use. @fontsource bundles
// each with the correct base path automatically, so they ship with the app and
// never block on a CDN.
import '@fontsource/syncopate/400.css'
import '@fontsource/syncopate/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/400-italic.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/600.css'

import App from './App.tsx'
import './theme/phosphor.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
