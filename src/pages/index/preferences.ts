import Taro from '@tarojs/taro'
import type { InHandEventType, UserPreferences } from '@shared/types'

export const USER_PREFERENCES_KEY = 'mahjong-user-preferences-v1'

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  hapticFeedback: true,
  quickScores: [50, 70],
  quickAdjustStep: 5,
  defaultMultiRon: false,
  clearScoreStateAfterSave: true,
  showSettlementPreview: true,
  autoSortTileRecord: true,
  highlightMatchingTiles: true,
  eventDefaults: {
    明杠: 20,
    暗杠: 10,
    花杠: 20,
    被跟圈: 10,
    四风归一: 10,
  },
  defaultGroupLocation: '',
  defaultGroupLeadMinutes: 60,
}

function normalizeScore(value: unknown, fallback: number) {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) && parsed >= 5 && parsed <= 999 ? parsed : fallback
}

function normalizeLeadMinutes(value: unknown): UserPreferences['defaultGroupLeadMinutes'] {
  return value === 30 || value === 60 || value === 120 ? value : DEFAULT_USER_PREFERENCES.defaultGroupLeadMinutes
}

export function normalizeUserPreferences(value: unknown): UserPreferences {
  const source = value && typeof value === 'object' ? value as Partial<UserPreferences> : {}
  const eventDefaults = source.eventDefaults && typeof source.eventDefaults === 'object'
    ? source.eventDefaults
    : DEFAULT_USER_PREFERENCES.eventDefaults
  const quickScores = Array.isArray(source.quickScores) ? source.quickScores : DEFAULT_USER_PREFERENCES.quickScores
  const normalizedEvents = Object.fromEntries(
    (Object.keys(DEFAULT_USER_PREFERENCES.eventDefaults) as InHandEventType[]).map(type => [
      type,
      normalizeScore(eventDefaults[type], DEFAULT_USER_PREFERENCES.eventDefaults[type]),
    ]),
  ) as Record<InHandEventType, number>

  return {
    hapticFeedback: source.hapticFeedback !== false,
    quickScores: [
      normalizeScore(quickScores[0], DEFAULT_USER_PREFERENCES.quickScores[0]),
      normalizeScore(quickScores[1], DEFAULT_USER_PREFERENCES.quickScores[1]),
    ],
    quickAdjustStep: normalizeScore(source.quickAdjustStep, DEFAULT_USER_PREFERENCES.quickAdjustStep),
    defaultMultiRon: source.defaultMultiRon === true,
    clearScoreStateAfterSave: source.clearScoreStateAfterSave !== false,
    showSettlementPreview: source.showSettlementPreview !== false,
    autoSortTileRecord: source.autoSortTileRecord !== false,
    highlightMatchingTiles: source.highlightMatchingTiles !== false,
    eventDefaults: normalizedEvents,
    defaultGroupLocation: typeof source.defaultGroupLocation === 'string' ? source.defaultGroupLocation.slice(0, 60) : '',
    defaultGroupLeadMinutes: normalizeLeadMinutes(source.defaultGroupLeadMinutes),
  }
}

export function readUserPreferences() {
  return normalizeUserPreferences(Taro.getStorageSync<unknown>(USER_PREFERENCES_KEY))
}

export function saveUserPreferences(preferences: UserPreferences) {
  Taro.setStorageSync(USER_PREFERENCES_KEY, normalizeUserPreferences(preferences))
}
