import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts — side-effect imports of only the weights we use. JetBrains Mono is the
// single typeface for the whole product. @fontsource bundles each with the
// correct base path automatically, so they ship with the app and never block on
// a CDN.
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/jetbrains-mono/400-italic.css'

import App from './App.tsx'
import './theme/theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
