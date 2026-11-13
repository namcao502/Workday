import {
  Button,
  Card,
  Checkbox,
  CheckboxGroup,
  Input,
  Label,
  Radio,
  RadioGroup,
  TextArea,
} from '@heroui/react'
import type { ChatAnswer, ChatQuestion, ChatRequest } from '@workday/core'
import { useState } from 'react'
import { t } from '../i18n.js'
import { ChatMarkdown } from './ChatRows.js'

interface ChatRequestCardProps {
  readonly request: ChatRequest
  readonly onAnswer: (answer: ChatAnswer) => void
  readonly busy: boolean // the answer is being sent
}

interface Pick {
  readonly labels: readonly string[]
  readonly otherOn: boolean
  readonly otherText: string
}

const EMPTY_PICK: Pick = { labels: [], otherOn: false, otherText: '' }
// Cannot collide with an option label.
const OTHER = '\u0000other'

// The labels picked plus the Other text, joined the way the server expects; '' while incomplete.
function answerOf(pick: Pick): string {
  const other = pick.otherOn ? pick.otherText.trim() : ''
  return [...pick.labels, ...(other === '' ? [] : [other])].join(', ')
}

function QuestionBlock({
  question,
  pick,
  disabled,
  onChange,
}: {
  readonly question: ChatQuestion
  readonly pick: Pick
  readonly disabled: boolean
  readonly onChange: (pick: Pick) => void
}): React.JSX.Element {
  const selected = pick.otherOn ? [...pick.labels, OTHER] : [...pick.labels]
  const change = (values: readonly string[]): void => {
    const otherOn = values.includes(OTHER)
    const labels = values.filter((value) => value !== OTHER)
    // A single choice drops the typed text when Other is left.
    onChange({ labels, otherOn, otherText: otherOn ? pick.otherText : '' })
  }
  const items = [...question.options.map((option) => option.label), OTHER]
  const renderLabel = (value: string): string => (value === OTHER ? t('Other', 'Khác') : value)
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">{question.question}</div>
      {question.multiSelect ? (
        <CheckboxGroup
          aria-label={question.question}
          isDisabled={disabled}
          value={selected}
          onChange={change}
        >
          {items.map((value) => (
            <Checkbox key={value} value={value}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label>{renderLabel(value)}</Label>
              </Checkbox.Content>
            </Checkbox>
          ))}
        </CheckboxGroup>
      ) : (
        <RadioGroup
          aria-label={question.question}
          isDisabled={disabled}
          value={pick.otherOn ? OTHER : (pick.labels[0] ?? null)}
          onChange={(value) => {
            change([value])
          }}
        >
          {items.map((value) => (
            <Radio key={value} value={value}>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Radio.Content>
                <Label>{renderLabel(value)}</Label>
              </Radio.Content>
            </Radio>
          ))}
        </RadioGroup>
      )}
      {pick.otherOn ? (
        <Input
          variant="secondary"
          aria-label={`${question.question} ${t('Other', 'Khác')}`}
          disabled={disabled}
          value={pick.otherText}
          onChange={(event) => {
            onChange({ ...pick, otherText: event.target.value })
          }}
        />
      ) : null}
    </div>
  )
}

function QuestionCard({ request, onAnswer, busy }: ChatRequestCardProps): React.JSX.Element {
  const [picks, setPicks] = useState<readonly Pick[]>([])
  const pickOf = (index: number): Pick => picks[index] ?? EMPTY_PICK
  const answers = request.questions.map((_question, index) => answerOf(pickOf(index)))
  const complete = request.questions.length !== 0 && answers.every((answer) => answer !== '')
  return (
    <>
      {request.questions.map((question, index) => (
        <QuestionBlock
          key={question.question}
          question={question}
          pick={pickOf(index)}
          disabled={busy}
          onChange={(pick) => {
            setPicks(request.questions.map((_q, i) => (i === index ? pick : pickOf(i))))
          }}
        />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          isDisabled={busy || !complete}
          onPress={() => {
            onAnswer({
              kind: 'answers',
              answers: Object.fromEntries(
                request.questions.map((question, index) => [
                  question.question,
                  answers[index] ?? '',
                ]),
              ),
            })
          }}
        >
          {t('Submit', 'Gửi')}
        </Button>
      </div>
    </>
  )
}

// A button that opens a text box; the second button sends the text with the given answer.
function ReasonBox({
  open,
  label,
  sendLabel,
  busy,
  onSend,
}: {
  readonly open: boolean
  readonly label: string
  readonly sendLabel: string
  readonly busy: boolean
  readonly onSend: (text: string) => void
}): React.JSX.Element | null {
  const [text, setText] = useState('')
  if (!open) {
    return null
  }
  return (
    <div className="flex flex-col gap-2">
      <TextArea
        variant="secondary"
        rows={2}
        aria-label={label}
        placeholder={label}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy}
          onPress={() => {
            onSend(text.trim())
          }}
        >
          {sendLabel}
        </Button>
      </div>
    </div>
  )
}

function PermissionCard({ request, onAnswer, busy }: ChatRequestCardProps): React.JSX.Element {
  const [denying, setDenying] = useState(false)
  return (
    <>
      {request.detail === null ? null : (
        <pre className="max-h-40 overflow-auto rounded-lg bg-surface-secondary p-2 font-mono text-xs whitespace-pre-wrap">
          {request.detail}
        </pre>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          isDisabled={busy}
          onPress={() => {
            onAnswer({ kind: 'allow', always: false })
          }}
        >
          {t('Allow', 'Cho phép')}
        </Button>
        {request.canAlwaysAllow ? (
          <Button
            variant="secondary"
            size="sm"
            isDisabled={busy}
            onPress={() => {
              onAnswer({ kind: 'allow', always: true })
            }}
          >
            {t('Always allow', 'Luôn cho phép')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          isDisabled={busy}
          onPress={() => {
            setDenying(true)
          }}
        >
          {t('Deny', 'Từ chối')}
        </Button>
      </div>
      <ReasonBox
        open={denying}
        label={t('Reason (optional)', 'Lý do (không bắt buộc)')}
        sendLabel={t('Send denial', 'Gửi từ chối')}
        busy={busy}
        onSend={(message) => {
          onAnswer({ kind: 'deny', message })
        }}
      />
    </>
  )
}

function PlanCard({ request, onAnswer, busy }: ChatRequestCardProps): React.JSX.Element {
  const [revising, setRevising] = useState(false)
  return (
    <>
      <div className="max-h-[50vh] overflow-auto rounded-lg bg-surface-secondary p-2">
        <ChatMarkdown text={request.detail ?? ''} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          isDisabled={busy}
          onPress={() => {
            onAnswer({ kind: 'approvePlan' })
          }}
        >
          {t('Approve', 'Duyệt')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          isDisabled={busy}
          onPress={() => {
            setRevising(true)
          }}
        >
          {t('Keep planning', 'Tiếp tục lập kế hoạch')}
        </Button>
      </div>
      <ReasonBox
        open={revising}
        label={t('Feedback', 'Góp ý')}
        sendLabel={t('Send feedback', 'Gửi góp ý')}
        busy={busy}
        onSend={(feedback) => {
          onAnswer({ kind: 'revisePlan', feedback })
        }}
      />
    </>
  )
}

function titleOf(request: ChatRequest): string {
  if (request.kind === 'plan') {
    return t('Claude has a plan', 'Claude có một kế hoạch')
  }
  if (request.kind === 'question') {
    return t('Claude has a question', 'Claude có câu hỏi')
  }
  return t(`Claude wants to use ${request.toolName}`, `Claude muốn dùng ${request.toolName}`)
}

export function ChatRequestCard(props: ChatRequestCardProps): React.JSX.Element {
  const { request } = props
  return (
    <Card variant="secondary" role="group" aria-label={titleOf(request)}>
      <Card.Content className="flex flex-col gap-2">
        <div className="text-base font-semibold">{titleOf(request)}</div>
        {request.kind === 'question' ? <QuestionCard {...props} /> : null}
        {request.kind === 'permission' ? <PermissionCard {...props} /> : null}
        {request.kind === 'plan' ? <PlanCard {...props} /> : null}
      </Card.Content>
    </Card>
  )
}
