import { homedir } from 'node:os'
import { join } from 'node:path'

// WORKDAY_DATA_DIR wins; else %APPDATA%\Workday on Windows, $XDG_DATA_HOME/workday elsewhere.
export function resolveDataDir(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const override = environment['WORKDAY_DATA_DIR']
  if (override !== undefined && override !== '') {
    return override
  }
  if (platform === 'win32') {
    const appData = environment['APPDATA']
    return join(
      appData !== undefined && appData !== '' ? appData : join(homedir(), 'AppData', 'Roaming'),
      'Workday',
    )
  }
  const dataHome = environment['XDG_DATA_HOME']
  return join(
    dataHome !== undefined && dataHome !== '' ? dataHome : join(homedir(), '.local', 'share'),
    'workday',
  )
}
