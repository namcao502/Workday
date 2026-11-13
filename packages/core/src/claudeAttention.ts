export type WaitReason = 'finished' | 'permission' | 'question'

// Looking at a finished turn is enough; a permission or question still blocks claude.
export function clearsWhenSeen(reason: WaitReason): boolean {
  return reason === 'finished'
}
