import { expect, it } from 'vitest'
import { parseIssue } from './parseJira.js'

const fieldIds = { etaFieldId: null, devPriorityFieldId: null }

it('parseIssue reads issuelinks without duplicates, inward and outward', () => {
  const ticket = parseIssue(
    {
      key: 'MDP-9323',
      fields: {
        issuelinks: [
          { outwardIssue: { key: 'MDP-1' } },
          { inwardIssue: { key: 'MDP-2' } },
          { inwardIssue: { key: 'MDP-1' } },
          { outwardIssue: { key: 'bad key' }, inwardIssue: { key: 'MDP-3' } },
          'junk',
        ],
      },
    },
    fieldIds,
  )
  expect(ticket?.linkedKeys).toEqual(['MDP-1', 'MDP-2', 'MDP-3'])
})

it('parseIssue gives no linked keys without issuelinks', () => {
  expect(parseIssue({ key: 'MDP-1', fields: {} }, fieldIds)?.linkedKeys).toEqual([])
})
