import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it } from 'vitest'
import { toEvent } from './sdkAgent.js'

describe('toEvent', () => {
  it('turns the background task list into descriptions, leaving ambient watchers out', () => {
    const message = {
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [
        {
          task_id: 't1',
          task_type: 'local_agent',
          description: 'Independent plan review: plan.md',
        },
        { task_id: 't2', task_type: 'monitor', description: 'watch logs', ambient: true },
      ],
      uuid: '00000000-0000-0000-0000-000000000000',
      session_id: 's-1',
    } as unknown as SDKMessage
    expect(toEvent(message, 'default')).toEqual({
      type: 'backgroundTasks',
      tasks: ['Independent plan review: plan.md'],
    })
  })
})
