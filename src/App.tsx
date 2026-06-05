// Placeholder shell — replaced by the PHOSPHOR workbench in the UI phase. For
// now it mounts a real TerminalPreview so `npm run dev` shows live output.
import { defaultConfig } from './model/presets/defaultPreset'
import { typical } from './model/presets/mockPresets'
import { TerminalPreview } from './preview/TerminalPreview'

export default function App() {
  return (
    <main>
      <h1>Pimp My Statusline</h1>
      <p>Workbench under construction.</p>
      <TerminalPreview config={defaultConfig()} mock={typical()} />
    </main>
  )
}
