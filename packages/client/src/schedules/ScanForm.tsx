import {
  Input,
  Label,
  ListBox,
  Select,
  Switch,
  TextArea,
  TextField as HeroTextField,
} from '@heroui/react'
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
import { Segmented } from '../ui/Segmented.js'
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
    <div className="flex flex-col gap-3">
      <HeroTextField fullWidth value={command} onChange={setCommand} onBlur={saveText}>
        <Label>{t('Command', 'Lệnh')}</Label>
        <Input id="scan-command" variant="secondary" />
      </HeroTextField>
      <HeroTextField fullWidth value={argsText} onChange={setArgsText} onBlur={saveText}>
        <Label>{t('Arguments (one per line)', 'Đối số (mỗi dòng một đối số)')}</Label>
        <TextArea id="scan-args" rows={3} variant="secondary" className="font-mono" />
      </HeroTextField>
      <HeroTextField fullWidth value={logFile} onChange={setLogFile} onBlur={saveText}>
        <Label>{t('Log file', 'File log')}</Label>
        <Input
          id="scan-log-file"
          variant="secondary"
          placeholder={t('Optional: the script writes its own log', 'Tùy chọn: script tự ghi log')}
        />
      </HeroTextField>
      <div className="flex flex-wrap items-center gap-2">
        <Switch
          isSelected={current.enabled}
          onChange={(enabled) => {
            void persist({ enabled })
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Label>{t('Run on schedule', 'Chạy theo lịch')}</Label>
          </Switch.Content>
        </Switch>
        <Segmented
          label={t('Day', 'Ngày')}
          value={current.day}
          options={SCAN_DAYS.map((day) => ({ value: day, label: dayLabel(day) }))}
          onChange={(day) => {
            void persist({ day })
          }}
        />
        <Select
          aria-label={t('Start time', 'Giờ bắt đầu')}
          variant="secondary"
          className="w-28"
          value={current.time}
          onChange={(key) => {
            if (key !== null) {
              void persist({ time: String(key) })
            }
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {startTimeChoices(current.time).map((time) => (
                <ListBox.Item key={time} id={time} textValue={time}>
                  {time}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">
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
        <p className="text-sm text-danger" role="status">
          {t('Could not save the scan settings', 'Không lưu được cài đặt quét')}
        </p>
      ) : null}
    </div>
  )
}
