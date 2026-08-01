// Pure history-building logic extracted from app/api/chat/route.ts.
// Kept here so it can be unit-tested without importing the full Next.js route.

export type RawMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type AttachmentPayload = {
  messageId: string
  base64: string
  mimeType: string
}

export type HistoryItem =
  | { role: 'user'; content: string | Array<{ type: string; [k: string]: unknown }> }
  | { role: 'assistant'; content: string }

/**
 * Build the Anthropic message history from raw client messages.
 *
 * - Slices to the last 20 messages.
 * - Trims from the front to the first user message so the history never
 *   starts with an assistant role (Anthropic rejects that with a 400).
 * - For each user message that matches an attachment's messageId, emits
 *   multimodal content blocks (one per attachment) followed by the text block.
 *   All other messages remain plain text.
 * - Removes consecutive duplicate roles as a defensive last pass.
 */
export function buildHistory(
  messages: RawMessage[],
  attachments?: AttachmentPayload[],
): HistoryItem[] {
  const rawSlice = messages.slice(-20)

  // Ensure the history never starts with an assistant message.
  // When the slice drops the initial hidden user check-in, the next item
  // would be the assistant greeting — Anthropic rejects "first message must
  // be user". Trim to the first user message to prevent this.
  const firstUserIdx = rawSlice.findIndex(m => m.role === 'user')
  const trimmed = firstUserIdx > 0 ? rawSlice.slice(firstUserIdx) : rawSlice

  // Build a lookup: messageId → attachments for that message
  const attsByMessage = new Map<string, AttachmentPayload[]>()
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      const existing = attsByMessage.get(att.messageId)
      if (existing) {
        existing.push(att)
      } else {
        attsByMessage.set(att.messageId, [att])
      }
    }
  }

  const history: HistoryItem[] = trimmed.map(msg => {
    const msgAtts = msg.role === 'user' ? attsByMessage.get(msg.id) : undefined
    if (msgAtts && msgAtts.length > 0) {
      const contentBlocks: Array<{ type: string; [k: string]: unknown }> = []
      for (const att of msgAtts) {
        const mediaType = att.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
        const block =
          att.mimeType === 'application/pdf'
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.base64 } }
            : { type: 'image', source: { type: 'base64', media_type: mediaType, data: att.base64 } }
        contentBlocks.push(block)
      }
      contentBlocks.push({ type: 'text', text: msg.content || '(attachment)' })
      return { role: 'user', content: contentBlocks }
    }
    if (msg.role === 'assistant') {
      return { role: 'assistant', content: msg.content }
    }
    // Use a fallback for empty content — happens when a user sends an attachment
    // with no text. The binary is gone from history on subsequent turns, so we
    // need at least a non-empty string to satisfy the Anthropic API.
    return { role: 'user', content: msg.content || '(attachment)' }
  })

  // Defensive: normalise any consecutive same-role messages that could have
  // slipped through (e.g. from unexpected state). Keep the last of each run
  // so no content is lost from the final user message.
  return normalizeRoles(history)
}

/**
 * Remove consecutive messages with the same role, keeping the LAST occurrence
 * in each same-role run. This preserves the content of the most-recent message
 * in any duplicated sequence.
 *
 * In normal operation this is a no-op — the invariant analysis shows consecutive
 * roles cannot arise from the current state machine. This guard is defensive.
 */
export function normalizeRoles(history: HistoryItem[]): HistoryItem[] {
  const result: HistoryItem[] = []
  for (const msg of history) {
    if (result.length > 0 && result[result.length - 1].role === msg.role) {
      // Replace the previous same-role message with the current one
      result[result.length - 1] = msg
    } else {
      result.push(msg)
    }
  }
  return result
}
