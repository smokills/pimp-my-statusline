// install.ts — pure builders for the export modal's per-language install steps
// and the settings.json snippet. refreshInterval is included ONLY when the
// config has time-based segments (needsRefreshInterval).

import type { StatuslineConfig } from '../../model/types'
import type { Lang } from '../../generators'
import { scriptFileName } from '../../generators'
import { needsRefreshInterval } from './refreshInterval'

export function savePath(lang: Lang): string {
  return `~/.claude/${scriptFileName(lang)}`
}

export function commandFor(lang: Lang): string {
  if (lang === 'bash') return '~/.claude/statusline.sh'
  if (lang === 'python') return 'python3 ~/.claude/statusline.py'
  return 'node ~/.claude/statusline.js'
}

/** The settings.json snippet (pretty JSON). refreshInterval is conditional. */
export function settingsSnippet(config: StatuslineConfig, lang: Lang): string {
  const statusLine: Record<string, unknown> = {
    type: 'command',
    command: commandFor(lang),
  }
  if (needsRefreshInterval(config)) statusLine.refreshInterval = 10
  return JSON.stringify({ statusLine }, null, 2)
}

export interface InstallStep {
  cmd?: string
  text: string
}

export function installSteps(lang: Lang): InstallStep[] {
  const file = savePath(lang)
  const steps: InstallStep[] = [{ text: `Save the script to ${file}` }]
  if (lang === 'bash') {
    steps.push({ text: 'Make it executable:', cmd: 'chmod +x ~/.claude/statusline.sh' })
  }
  steps.push({
    text: 'Add the statusLine block to ~/.claude/settings.json (merge with any existing settings).',
  })
  steps.push({ text: 'Start (or restart) Claude Code — the statusline appears at the bottom.' })
  return steps
}

export function dependencyNote(lang: Lang): string {
  if (lang === 'bash') {
    return 'requires jq — brew install jq / apt install jq · Python & Node exports have zero dependencies'
  }
  return 'zero dependencies — uses only the language standard library'
}
