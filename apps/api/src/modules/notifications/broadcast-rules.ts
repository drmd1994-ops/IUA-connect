/**
 * Broadcast rules (M7 plan §2.6, §3). A message is written by one admin and decided on by a
 * different one; nothing reaches members on one person's say.
 */
export type BroadcastStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'SENT' | 'REJECTED';
export type BroadcastAction = 'SUBMIT' | 'APPROVE' | 'REJECT';

export interface BroadcastActor {
  userId: string;
  /** Holds broadcasts.approve. */
  canApprove: boolean;
}

/** The author changes a draft, or a message that was sent back to them. */
export function canEdit(status: BroadcastStatus): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}

/**
 * Why a step isn't allowed, as an error code, or null when it is.
 * "forbidden" is a missing permission; the others are rules about this message.
 */
export function stepProblem(
  action: BroadcastAction,
  broadcast: { status: BroadcastStatus; createdBy: string },
  actor: BroadcastActor,
): 'forbidden' | 'broadcastNotYours' | 'broadcastOwn' | 'broadcastStepNotAllowed' | null {
  if (action === 'SUBMIT') {
    if (broadcast.createdBy !== actor.userId) return 'broadcastNotYours';
    return canEdit(broadcast.status) ? null : 'broadcastStepNotAllowed';
  }
  if (!actor.canApprove) return 'forbidden';
  if (broadcast.status !== 'PENDING_APPROVAL') return 'broadcastStepNotAllowed';
  // Two admins: the author never decides on their own message.
  return broadcast.createdBy === actor.userId ? 'broadcastOwn' : null;
}

/** What a message still needs before it can be submitted, or null. */
export function submitProblem(text: {
  hebrewTitle: string;
  hebrewBody: string;
}): 'broadcastHebrewRequired' | null {
  return text.hebrewTitle.trim() && text.hebrewBody.trim() ? null : 'broadcastHebrewRequired';
}

/** The text as paragraphs: blank lines separate them; single line breaks are kept. */
export function paragraphsOf(body: string): string[] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
