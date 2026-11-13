import { useQueryClient } from '@tanstack/react-query'
import {
  SCAN_DAYS,
  SCAN_LIMIT_HOURS,
  startTimeChoices,
  type KnowledgeScanConfig,
} from '@workday/core'
import { useState } from 'react'
import { queryKeys } from '../api/client.js'
import { useSaveSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { Segmented } from '../settings/Segmented.js'
import { dayLabel } from './scheduleFormat.js'

export const DEFAULT_SCAN: KnowledgeScanConfig = {
  enabled: false,
  command: 'pwsh',
  args: ['-NoProfile', '-File', '<path>'],
  day: 'daily',
  time: '09:00',
  limitHours: 2,
  logFile: null,
}

function argsFromText(text: string): readonly string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

// Every change is saved at once; the text fields save when they lose focus.
export function ScanForm({
  config,
}: {
  readonly config: KnowledgeScanConfig | null
}): React.JSX.Element {
  const save = useSaveSettings()
  const queryClient = useQueryClient()
  const current = config ?? DEFAULT_SCAN
  const [command, setCommand] = useState(current.command)
  const [argsText, setArgsText] = useState(current.args.join('\n'))
  const [logFile, setLogFile] = useState(current.logFile ?? '')
  const [failed, setFailed] = useState(false)

  // Always sends the text drafts too, so a click right after typing cannot save the old text.
  async function persist(changes: Partial<KnowledgeScanConfig>): Promise<void> {
    const trimmedLog = logFile.trim()
    const next: KnowledgeScanConfig = {
      ...current,
      command: command.trim(),
      args: argsFromText(argsText),
      logFile: trimmedLog === '' ? null : trimmedLog,
      ...changes,
    }
    try {
      await save({ knowledgeScan: next })
      setFailed(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules })
    } catch {
      setFailed(true)
    }
  }

  function saveText(): void {
    const unchanged =
      command.trim() === current.command &&
      argsText === current.args.join('\n') &&
      logFile.trim() === (current.logFile ?? '')
    if (!unchanged) {
      void persist({})
    }
  }

  return (
    <div className="scan-form">
      <label className="form-field" htmlFor="scan-command">
        <span className="field-label">{t('Command', 'Lệnh')}</span>
        <input
          id="scan-command"
          className="input"
          value={command}
          onChange={(event) => {
            setCommand(event.target.value)
          }}
          onBlur={saveText}
        />
      </label>
      <label className="form-field" htmlFor="scan-args">
        <span className="field-label">
          {t('Arguments (one per line)', 'Đối số (mỗi dòng một đối số)')}
        </span>
        <textarea
          id="scan-args"
          className="input scan-args"
          rows={3}
          value={argsText}
          onChange={(event) => {
            setArgsText(event.target.value)
          }}
          onBlur={saveText}
        />
      </label>
      <label className="form-field" htmlFor="scan-log-file">
        <span className="field-label">{t('Log file', 'File log')}</span>
        <input
          id="scan-log-file"
          className="input"
          value={logFile}
          placeholder={t('Optional: the script writes its own log', 'Tùy chọn: script tự ghi log')}
          onChange={(event) => {
            setLogFile(event.target.value)
          }}
          onBlur={saveText}
        />
      </label>
      <div className="scan-schedule">
        <label className="inline-row" htmlFor="scan-enabled">
          <input
            id="scan-enabled"
            type="checkbox"
            role="switch"
            checked={current.enabled}
            onChange={(event) => {
              void persist({ enabled: event.target.checked })
            }}
          />
          <span>{t('Run on schedule', 'Chạy theo lịch')}</span>
        </label>
        <Segmented
          label={t('Day', 'Ngày')}
          value={current.day}
          options={SCAN_DAYS.map((day) => ({ value: day, label: dayLabel(day) }))}
          onChange={(day) => {
            void persist({ day })
          }}
        />
        <select
          className="input scan-time"
          aria-label={t('Start time', 'Giờ bắt đầu')}
          value={current.time}
          onChange={(event) => {
            void persist({ time: event.target.value })
          }}
        >
          {startTimeChoices(current.time).map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </div>
      <div className="scan-schedule">
        <span className="field-label">
          {t('Stop a run after (hours)', 'Dừng lần chạy sau (giờ)')}
        </span>
        <Segmented
          label={t('Time limit', 'Giới hạn thời gian')}
          value={String(current.limitHours)}
          options={SCAN_LIMIT_HOURS.map((hours) => ({
            value: String(hours),
            label: `${String(hours)} h`,
          }))}
          onChange={(hours) => {
            const limit = SCAN_LIMIT_HOURS.find((choice) => String(choice) === hours)
            if (limit !== undefined) {
              void persist({ limitHours: limit })
            }
          }}
        />
      </div>
      {failed ? (
        <p className="status danger" role="status">
          {t('Could not save the scan settings', 'Không lưu được cài đặt quét')}
        </p>
      ) : null}
    </div>
  )
}
