import { join } from 'node:path'
import type { EpicTicket, Suggestion } from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'
import type { SuggestionState } from './suggestionService.js'

const SUGGESTIONS_FILE = 'suggestions.json'

export const EMPTY_SUGGESTION_STATE: SuggestionState = {
  epic: null,
  epicMonth: null,
  items: [],
  hiddenKeys: [],
  notifiedKeys: [],
  notifiedOn: null,
  baselineDone: false,
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function isTextList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string')
}

function isEpicTicket(raw: unknown): raw is EpicTicket {
  return (
    isRecord(raw) &&
    typeof raw['key'] === 'string' &&
    typeof raw['summary'] === 'string' &&
    isNullableText(raw['status']) &&
    isNullableText(raw['issueType']) &&
    isNullableText(raw['priority']) &&
    isNullableNumber(raw['devPriority']) &&
    isNullableText(raw['dueDate'])
  )
}

function isSuggestion(raw: unknown): raw is Suggestion {
  return (
    isRecord(raw) &&
    isEpicTicket(raw['ticket']) &&
    typeof raw['score'] === 'number' &&
    isNullableText(raw['similarKey']) &&
    typeof raw['urgent'] === 'boolean'
  )
}

function parseSuggestionState(raw: unknown): SuggestionState | null {
  if (
    !isRecord(raw) ||
    !(raw['epic'] === null || isEpicTicket(raw['epic'])) ||
    !isNullableText(raw['epicMonth']) ||
    !Array.isArray(raw['items']) ||
    !raw['items'].every(isSuggestion) ||
    !isTextList(raw['hiddenKeys']) ||
    !isTextList(raw['notifiedKeys']) ||
    !isNullableText(raw['notifiedOn']) ||
    typeof raw['baselineDone'] !== 'boolean'
  ) {
    return null
  }
  return {
    epic: raw['epic'],
    epicMonth: raw['epicMonth'],
    items: raw['items'],
    hiddenKeys: raw['hiddenKeys'],
    notifiedKeys: raw['notifiedKeys'],
    notifiedOn: raw['notifiedOn'],
    baselineDone: raw['baselineDone'],
  }
}

export function loadSuggestionState(dataDir: string): SuggestionState {
  return readJson(join(dataDir, SUGGESTIONS_FILE), parseSuggestionState, EMPTY_SUGGESTION_STATE)
}

export async function saveSuggestionState(dataDir: string, state: SuggestionState): Promise<void> {
  await writeJsonAtomic(join(dataDir, SUGGESTIONS_FILE), state)
}
