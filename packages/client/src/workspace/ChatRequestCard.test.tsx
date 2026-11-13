import { fireEvent, render, screen } from '@testing-library/react'
import type { ChatRequest } from '@workday/core'
import { expect, it, vi } from 'vitest'
import { ChatRequestCard } from './ChatRequestCard.js'

const BASE: ChatRequest = {
  id: 'r1',
  kind: 'question',
  toolName: 'AskUserQuestion',
  detail: null,
  questions: [],
  canAlwaysAllow: false,
}

it('a question card sends the picked labels and an Other text', () => {
  const onAnswer = vi.fn()
  const request: ChatRequest = {
    ...BASE,
    questions: [
      {
        question: 'Which db?',
        header: 'DB',
        multiSelect: false,
        options: [
          { label: 'Postgres', description: '' },
          { label: 'SQLite', description: '' },
        ],
      },
      {
        question: 'Which tools?',
        header: 'Tools',
        multiSelect: true,
        options: [
          { label: 'Lint', description: '' },
          { label: 'Test', description: '' },
        ],
      },
    ],
  }
  render(<ChatRequestCard request={request} onAnswer={onAnswer} busy={false} />)
  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  fireEvent.click(screen.getByRole('radio', { name: 'Postgres' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Lint' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Test' }))
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(onAnswer).toHaveBeenLastCalledWith({
    kind: 'answers',
    answers: { 'Which db?': 'Postgres', 'Which tools?': 'Lint, Test' },
  })
  fireEvent.click(screen.getByRole('radio', { name: 'Other' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Which db? Other' }), {
    target: { value: 'Mongo' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(onAnswer).toHaveBeenLastCalledWith({
    kind: 'answers',
    answers: { 'Which db?': 'Mongo', 'Which tools?': 'Lint, Test' },
  })
})

it('a plan card approves, and Keep planning sends the feedback', () => {
  const onAnswer = vi.fn()
  const request: ChatRequest = {
    ...BASE,
    kind: 'plan',
    toolName: 'ExitPlanMode',
    detail: '# Plan\n\n- step one',
  }
  render(<ChatRequestCard request={request} onAnswer={onAnswer} busy={false} />)
  expect(screen.getByText('step one')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
  expect(onAnswer).toHaveBeenLastCalledWith({ kind: 'approvePlan' })
  fireEvent.click(screen.getByRole('button', { name: 'Keep planning' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Feedback' }), {
    target: { value: 'add tests' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
  expect(onAnswer).toHaveBeenLastCalledWith({ kind: 'revisePlan', feedback: 'add tests' })
})

it('a permission card offers Always allow only when allowed, and Deny sends the reason', () => {
  const onAnswer = vi.fn()
  const request: ChatRequest = {
    ...BASE,
    kind: 'permission',
    toolName: 'Bash',
    detail: 'ls',
    canAlwaysAllow: true,
  }
  render(<ChatRequestCard request={request} onAnswer={onAnswer} busy={false} />)
  fireEvent.click(screen.getByRole('button', { name: 'Always allow' }))
  expect(onAnswer).toHaveBeenLastCalledWith({ kind: 'allow', always: true })
  fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason (optional)' }), {
    target: { value: 'no' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send denial' }))
  expect(onAnswer).toHaveBeenLastCalledWith({ kind: 'deny', message: 'no' })
})

it('busy disables every button', () => {
  const request: ChatRequest = { ...BASE, kind: 'permission', toolName: 'Bash', detail: 'ls' }
  render(<ChatRequestCard request={request} onAnswer={vi.fn()} busy />)
  for (const button of screen.getAllByRole('button')) {
    expect(button).toBeDisabled()
  }
})
