import type { SeasonEffects } from '@workday/core'
import type { EffectLevel } from './SeasonLayer.js'

// 'auto' saves a phone's battery: light there, full on a wide screen.
export function effectLevel(setting: SeasonEffects | undefined, narrow: boolean): EffectLevel {
  if (setting === undefined || setting === 'auto') {
    return narrow ? 'light' : 'full'
  }
  return setting
}
