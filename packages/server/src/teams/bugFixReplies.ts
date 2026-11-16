// Which QC bug fixes still wait for a reply in the parent ticket's Teams threads (port of TrayApp.UpdateBugReplyStates).
import {
  buildReplyHtml,
  isFixReplied,
  newestOtherMessageAt,
  qcToTag,
  replyMention,
  type BugFix,
  type BugReply,
  type TeamsThread,
} from '@workday/core'

// A fix first seen as not replied: the conversation to answer in and the conversation key for the notice's place.
export interface FixToAnnounce {
  readonly fix: BugFix
  readonly conversationId: string
  readonly conversationKey: string
}

interface Place {
  readonly conversationId: string
  readonly conversationKey: string
}

interface ReplyTarget extends Place {
  readonly at: string
}

// State lives for the server run; a fix not read in any thread yet has none and so shows no to-do.
export class BugFixReplies {
  private fixes: readonly BugFix[] = []
  private readonly replied = new Map<string, boolean>()
  // Where someone else spoke last, per bug; firstSeen is the fallback when nobody else did.
  private readonly targets = new Map<string, ReplyTarget>()
  private readonly firstSeen = new Map<string, Place>()
  private readonly announced = new Set<string>()

  // A new draft for a bug starts its reply state over: the earlier answer was to the earlier fix.
  setFixes(fixes: readonly BugFix[]): void {
    for (const fix of fixes) {
      const before = this.fixes.find((known) => known.bugKey === fix.bugKey)
      if (before !== undefined && before.draftWrittenAt !== fix.draftWrittenAt) {
        this.replied.delete(fix.bugKey)
        this.announced.delete(fix.bugKey)
      }
    }
    this.fixes = fixes
  }

  parents(): readonly string[] {
    return [...new Set(this.fixes.map((fix) => fix.parentKey))]
  }

  // Fixes known and not replied.
  toAnswer(): readonly BugFix[] {
    return this.fixes.filter((fix) => this.replied.get(fix.bugKey) === false)
  }

  // From a read of one of the parent's threads: which fixes it answers and where QC spoke last.
  update(parentKey: string, thread: TeamsThread, myId: string, conversationKey: string): void {
    const newestOtherAt = newestOtherMessageAt(thread, myId)
    const place = { conversationId: thread.conversationId, conversationKey }
    for (const fix of this.fixes.filter((known) => known.parentKey === parentKey)) {
      const target = this.targets.get(fix.bugKey)
      if (
        newestOtherAt !== null &&
        (target === undefined || Date.parse(newestOtherAt) > Date.parse(target.at))
      ) {
        this.targets.set(fix.bugKey, { ...place, at: newestOtherAt })
      }
      if (!this.firstSeen.has(fix.bugKey)) {
        this.firstSeen.set(fix.bugKey, place)
      }
      // An answer in any of the ticket's threads is enough, so a thread without it does not undo another's.
      this.replied.set(
        fix.bugKey,
        this.replied.get(fix.bugKey) === true || isFixReplied(thread, myId, fix),
      )
    }
  }

  // After all threads of a check are read: the fixes still unanswered that were not announced yet (once per run).
  announce(): readonly FixToAnnounce[] {
    const toAnnounce: FixToAnnounce[] = []
    for (const fix of this.toAnswer()) {
      const place = this.targets.get(fix.bugKey) ?? this.firstSeen.get(fix.bugKey)
      if (place !== undefined && !this.announced.has(fix.bugKey)) {
        this.announced.add(fix.bugKey)
        toAnnounce.push({ fix, ...place })
      }
    }
    return toAnnounce
  }

  // The thread on screen: its card already says so, so nothing is announced, but the bug counts as announced.
  cardFor(
    parentKey: string,
    thread: TeamsThread,
    myId: string,
    conversationKey: string,
  ): readonly BugReply[] {
    this.update(parentKey, thread, myId, conversationKey)
    this.announce()
    const qc = qcToTag(thread, myId)
    return this.fixes
      .filter((fix) => fix.parentKey === parentKey && this.replied.get(fix.bugKey) === false)
      .sort((a, b) => (a.bugKey < b.bugKey ? -1 : a.bugKey > b.bugKey ? 1 : 0))
      .map((fix) => ({
        fix,
        replyHtml: buildReplyHtml(fix, qc),
        mentions: qc === null ? [] : [replyMention(qc)],
      }))
  }
}
