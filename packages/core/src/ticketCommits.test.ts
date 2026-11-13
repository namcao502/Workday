import { describe, expect, it } from 'vitest'
import { addCommits, parseNumstat } from './ticketCommits.js'

const MORNING = 1793588400

function record(hash: string, ref: string, time: number, ...numstat: string[]): string {
  return `\u001e${hash}\t${ref}\t${String(time)}\n\n${numstat.join('\n')}\n`
}

describe('parseNumstat', () => {
  it('counts commits, files and lines per ticket', () => {
    const output =
      record('a1', 'MDP-1', MORNING, '3\t1\tsrc/A.cs') +
      record('b2', 'origin/MDP-1', MORNING + 60, '2\t4\tsrc/A.cs')

    expect(parseNumstat(output, 'MDP-')['MDP-1']).toEqual({
      commits: 2,
      files: 1,
      added: 5,
      deleted: 5,
    })
  })

  it('counts a file once per repo and a binary file as zero lines', () => {
    const output =
      record('a1', 'MDP-1', MORNING, '-\t-\timg.png', '1\t0\tB.cs') +
      record('a2', 'MDP-1', MORNING, '1\t1\tB.cs')

    expect(parseNumstat(output, 'MDP-')['MDP-1']).toEqual({
      commits: 2,
      files: 2,
      added: 2,
      deleted: 1,
    })
  })

  it('counts a commit seen under two refs once', () => {
    const output =
      record('a1', 'MDP-1', MORNING, '1\t0\tA.cs') +
      record('a1', 'origin/MDP-1', MORNING, '1\t0\tA.cs')

    expect(parseNumstat(output, 'MDP-')['MDP-1']?.commits).toBe(1)
  })

  it('skips a ref with no ticket key or another project prefix', () => {
    const output =
      record('a1', 'feature/x', MORNING, '1\t1\tA.cs') +
      record('b2', 'ABC-5', MORNING, '1\t1\tA.cs')

    expect(parseNumstat(output, 'MDP-')).toEqual({})
  })
})

describe('addCommits', () => {
  it('sums tickets across repositories, keeping files per repository', () => {
    const backend = parseNumstat(record('a1', 'MDP-1', MORNING, '1\t1\tsrc/A.cs'), 'MDP-')
    const frontend = parseNumstat(record('b2', 'MDP-1', MORNING, '2\t2\tsrc/A.cs'), 'MDP-')

    expect(addCommits(backend, frontend)['MDP-1']).toEqual({
      commits: 2,
      files: 2,
      added: 3,
      deleted: 3,
    })
  })
})
