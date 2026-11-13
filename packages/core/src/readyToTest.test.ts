import { describe, expect, it } from 'vitest'
import { autoSteps, isWithDeveloper, readyToTestSteps, stepsToReadyToTest } from './readyToTest.js'

const path = ['PR & Code Review', 'Deployed to Dev', 'Ready to Test']
const developerStatuses = [
  'Backlog',
  'Selected for Development',
  'In Progress',
  'QA Failed',
  'Reopened',
  'To Do',
]

describe('stepsToReadyToTest', () => {
  it('returns both steps when in PR & Code Review', () => {
    expect(stepsToReadyToTest('PR & Code Review', path)).toEqual([
      'Deployed to Dev',
      'Ready to Test',
    ])
  })

  it('returns the last step when already deployed to dev', () => {
    expect(stepsToReadyToTest('deployed to dev', path)).toEqual(['Ready to Test'])
  })

  it.each(['In Progress', 'Ready To Test', 'QA Confirmed', null])(
    'returns no steps for %j',
    (status) => {
      expect(stepsToReadyToTest(status, path)).toEqual([])
    },
  )

  it('walks the configured path and never backward', () => {
    expect(stepsToReadyToTest('Ready to Test', path)).toEqual([])
    expect(stepsToReadyToTest('Deployed to Dev', path)).not.toContain('PR & Code Review')
  })

  it('is empty when the path is not configured', () => {
    expect(stepsToReadyToTest('PR & Code Review', [])).toEqual([])
  })
})

describe('autoSteps', () => {
  it('stops at Deployed to Dev while pipelines run or failed', () => {
    expect(autoSteps('PR & Code Review', path, 'deploying')).toEqual(['Deployed to Dev'])
    expect(autoSteps('PR & Code Review', path, 'failed')).toEqual(['Deployed to Dev'])
    expect(autoSteps('Deployed to Dev', path, 'deploying')).toEqual([])
  })

  it('goes on to Ready to Test once deployed', () => {
    expect(autoSteps('PR & Code Review', path, 'deployed')).toEqual([
      'Deployed to Dev',
      'Ready to Test',
    ])
    expect(autoSteps('Deployed to Dev', path, 'deployed')).toEqual(['Ready to Test'])
  })

  it.each(['In Progress', 'Ready to Test', null])('is empty for %j', (status) => {
    expect(autoSteps(status, path, 'deployed')).toEqual([])
  })
})

describe('readyToTestSteps', () => {
  it('returns the steps when in progress and the dev PR merged', () => {
    expect(readyToTestSteps('inProgress', 'PR & Code Review', true, path)).toEqual([
      'Deployed to Dev',
      'Ready to Test',
    ])
  })

  it('returns null for the new section, an unmerged dev PR or no steps left', () => {
    expect(readyToTestSteps('new', 'PR & Code Review', true, path)).toBeNull()
    expect(readyToTestSteps('done', 'PR & Code Review', false, path)).toBeNull()
    expect(readyToTestSteps('done', 'Ready to Test', true, path)).toBeNull()
  })
})

describe('isWithDeveloper', () => {
  it.each([
    ['Backlog', true],
    ['in progress', true],
    ['QA Failed', true],
    [null, true],
    ['', true],
    ['Hold', false],
    ['PR & Code Review', false],
    ['Deployed to Dev', false],
    ['Ready to Test', false],
  ])('status %j gives %s', (status, expected) => {
    expect(isWithDeveloper(status, developerStatuses)).toBe(expected)
  })

  it('counts every status when none are configured', () => {
    expect(isWithDeveloper('Hold', [])).toBe(true)
  })
})
