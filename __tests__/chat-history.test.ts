import { describe, it, expect } from 'vitest'
import { buildHistory, normalizeRoles, type RawMessage, type HistoryItem } from '../lib/chat-history'

// ─── Helpers ───────────────────────────────────────────────────────────────

function user(id: string, content = 'text'): RawMessage {
  return { id, role: 'user', content }
}
function assistant(id: string, content = 'reply'): RawMessage {
  return { id, role: 'assistant', content }
}

/** Build a realistic conversation: [hidden_user, assistant, (user, assistant)*n] */
function makeConversation(turns: number): RawMessage[] {
  const msgs: RawMessage[] = [user('c1', 'checkin prompt'), assistant('a0', 'greeting')]
  for (let i = 1; i <= turns; i++) {
    msgs.push(user(`u${i}`, `message ${i}`))
    msgs.push(assistant(`a${i}`, `response ${i}`))
  }
  return msgs
}

function firstRole(history: HistoryItem[]) { return history[0]?.role }
function rolesOf(history: HistoryItem[]) { return history.map(m => m.role) }
function hasConsecutiveSameRole(history: HistoryItem[]) {
  return history.some((m, i) => i > 0 && m.role === history[i - 1].role)
}

// ─── 1. Long conversations: history starts with user after 20+ messages ────

describe('slice and trim', () => {
  it('starts with user when conversation has exactly 20 messages', () => {
    // 20 messages: [user, assistant, user, assistant, ...] × 10 turns
    const msgs = makeConversation(9) // 2 + 18 = 20 messages
    expect(msgs).toHaveLength(20)
    const history = buildHistory(msgs)
    expect(firstRole(history)).toBe('user')
  })

  it('starts with user when updatedMessages has 21 items (the critical threshold)', () => {
    // After 9 full turns, messages state = 20. updatedMessages = 21 (new user msg appended).
    const msgs = makeConversation(9)
    const newMsg = user('u10', 'tenth message')
    const updatedMessages = [...msgs, newMsg] // 21 items
    expect(updatedMessages).toHaveLength(21)
    const history = buildHistory(updatedMessages)
    expect(firstRole(history)).toBe('user')
  })

  it('starts with user for conversations of 25, 30, 40 messages', () => {
    for (const turns of [12, 14, 19]) {
      const msgs = makeConversation(turns)
      const history = buildHistory(msgs)
      expect(firstRole(history), `turns=${turns}`).toBe('user')
    }
  })

  it('preserves valid alternating user/assistant ordering after trim', () => {
    const msgs = makeConversation(14) // 30 messages, slice=-20 drops first 10
    const history = buildHistory(msgs)
    expect(firstRole(history)).toBe('user')
    expect(hasConsecutiveSameRole(history)).toBe(false)
  })

  it('last message in history is always the most-recent user message', () => {
    const msgs = makeConversation(12)
    const newMsg = user('latest', 'current turn')
    const history = buildHistory([...msgs, newMsg])
    const last = history[history.length - 1]
    expect(last.role).toBe('user')
    expect(last.content).toBe('current turn')
  })

  it('returns empty array for empty input', () => {
    expect(buildHistory([])).toEqual([])
  })
})

// ─── 2. Role alternation is valid in all realistic conversation shapes ──────

describe('role ordering', () => {
  it('single user message produces valid single-item history', () => {
    const history = buildHistory([user('u1', 'hello')])
    expect(rolesOf(history)).toEqual(['user'])
  })

  it('standard pair [user, assistant] is unchanged', () => {
    const history = buildHistory([user('u1'), assistant('a1')])
    expect(rolesOf(history)).toEqual(['user', 'assistant'])
  })

  it('ten-turn conversation has no consecutive same-role messages', () => {
    const history = buildHistory(makeConversation(10))
    expect(hasConsecutiveSameRole(history)).toBe(false)
  })

  it('conversation with failed send (user + error-assistant pairs) stays valid', () => {
    // Simulate: two failed sends (each adds user + error-assistant) then a success
    const msgs: RawMessage[] = [
      user('c1', 'checkin'), assistant('a0', 'greeting'),
      user('u1', 'question'), assistant('a1', 'answer'),
      user('f1', 'image attempt'), assistant('e1', 'Sorry, something went wrong. Please try again.'),
      user('f2', 'retry'), assistant('e2', 'Sorry, something went wrong. Please try again.'),
      user('u3', 'text fallback'), assistant('a3', 'success'),
      user('u4', 'follow-up'),
    ]
    const history = buildHistory(msgs)
    expect(firstRole(history)).toBe('user')
    expect(hasConsecutiveSameRole(history)).toBe(false)
  })
})

// ─── 3. Attachment applied to correct message; no carryover ─────────────────

describe('attachment handling', () => {
  const attachment = { messageId: 'u2', base64: 'fakebase64', mimeType: 'image/jpeg' }

  it('applies multimodal blocks to the matching message only', () => {
    const msgs = [
      user('c1', 'checkin'), assistant('a0', 'hi'),
      user('u2', 'look at this'),
      assistant('a2', 'I see the image'),
      user('u3', 'follow-up'),
    ]
    const history = buildHistory(msgs, attachment)
    const imgMsg = history.find(m => m.role === 'user' && Array.isArray(m.content))
    expect(imgMsg).toBeDefined()
    expect(Array.isArray(imgMsg!.content)).toBe(true)
    const blocks = imgMsg!.content as Array<{ type: string }>
    expect(blocks[0].type).toBe('image')
    expect(blocks[1].type).toBe('text')
  })

  it('all other user messages remain plain strings', () => {
    const msgs = [
      user('c1', 'checkin'), assistant('a0', 'hi'),
      user('u2', 'look at this'),
      assistant('a2', 'I see it'),
      user('u3', 'next question'),
    ]
    const history = buildHistory(msgs, attachment)
    const plainUserMsgs = history.filter(
      m => m.role === 'user' && !Array.isArray(m.content)
    )
    // u3 and c1 should be plain strings
    expect(plainUserMsgs.length).toBeGreaterThanOrEqual(1)
    plainUserMsgs.forEach(m => expect(typeof m.content).toBe('string'))
  })

  it('uses (attachment) text when user content is empty string', () => {
    const msgs = [user('u1', ''), assistant('a1', 'hi'), user('u2', '')]
    const history = buildHistory(msgs, { messageId: 'u2', base64: 'b64', mimeType: 'image/png' })
    const imgMsg = history.find(m => Array.isArray(m.content)) as { role: 'user'; content: Array<{ type: string; text?: string }> }
    expect(imgMsg).toBeDefined()
    const textBlock = imgMsg!.content.find(b => b.type === 'text')
    expect(textBlock?.text).toBe('(attachment)')
  })

  it('attachment not applied when messageId is not in the sliced window', () => {
    // u_old is beyond the 20-message window; attachment should be ignored
    const msgs = makeConversation(11) // 24 messages; u_old not in slice(-20)
    const staleAttachment = { messageId: 'u1', base64: 'b64', mimeType: 'image/jpeg' }
    const history = buildHistory(msgs, staleAttachment)
    expect(history.every(m => !Array.isArray(m.content))).toBe(true)
  })

  it('second attachment replaces first — first message reverts to plain text', () => {
    const msgs = [
      user('c1', 'checkin'), assistant('a0', 'hi'),
      user('u2', 'image 1 text'), assistant('a2', 'I see image 1'),
      user('u3', 'image 2 text'), assistant('a3', 'I see image 2'),
      user('u4', 'follow-up'),
    ]
    // Active attachment is now image2 (u3); image1 (u2) should be plain text
    const image2 = { messageId: 'u3', base64: 'img2base64', mimeType: 'image/jpeg' }
    const history = buildHistory(msgs, image2)

    const u2Entry = history.find(m => typeof m.content === 'string' && m.content === 'image 1 text')
    expect(u2Entry).toBeDefined()
    expect(typeof u2Entry!.content).toBe('string')

    const u3Entry = history.find(m => Array.isArray(m.content))
    expect(u3Entry).toBeDefined()
  })
})

// ─── 4. Active attachment state: only updated on success ────────────────────

describe('activeAttachment state machine', () => {
  // Model the sendMessage logic in isolation (no React, no fetch).
  // activeAttachment is updated inside the try block after success.

  type AttachmentState = { messageId: string; base64: string; mimeType: string } | null

  function simulateSend(
    currentActive: AttachmentState,
    newAtt: { base64: string; mimeType: string } | null,
    messageId: string,
    succeeds: boolean,
  ): AttachmentState {
    // This mirrors the fixed sendMessage logic:
    //   setActiveAttachment is inside try, only called when succeeded=true
    if (succeeds && newAtt) {
      return { messageId, base64: newAtt.base64, mimeType: newAtt.mimeType }
    }
    // On failure, or when no new attachment, activeAttachment is unchanged
    return currentActive
  }

  it('successful send with new attachment updates active attachment', () => {
    const result = simulateSend(null, { base64: 'img1', mimeType: 'image/jpeg' }, 'msg1', true)
    expect(result).toEqual({ messageId: 'msg1', base64: 'img1', mimeType: 'image/jpeg' })
  })

  it('failed send with new attachment does NOT update active attachment', () => {
    const prev: AttachmentState = { messageId: 'prev', base64: 'img0', mimeType: 'image/jpeg' }
    const result = simulateSend(prev, { base64: 'img1', mimeType: 'image/jpeg' }, 'msg1', false)
    // Active attachment must remain unchanged
    expect(result).toEqual(prev)
  })

  it('failed send preserves null active attachment', () => {
    const result = simulateSend(null, { base64: 'img1', mimeType: 'image/jpeg' }, 'msg1', false)
    expect(result).toBeNull()
  })

  it('text message send (no new attachment) never changes active attachment', () => {
    const prev: AttachmentState = { messageId: 'u2', base64: 'img1', mimeType: 'image/jpeg' }
    const successResult = simulateSend(prev, null, 'u3', true)
    const failResult = simulateSend(prev, null, 'u3', false)
    expect(successResult).toEqual(prev)
    expect(failResult).toEqual(prev)
  })

  it('subsequent text messages after a failed attachment use old active attachment', () => {
    const image1: AttachmentState = { messageId: 'u2', base64: 'img1', mimeType: 'image/jpeg' }

    // Turn: image2 fails — active attachment stays as image1
    const afterFailedImage2 = simulateSend(image1, { base64: 'img2', mimeType: 'image/jpeg' }, 'u3', false)
    expect(afterFailedImage2).toEqual(image1)

    // Turn: plain text succeeds — active attachment still image1 (no new attachment)
    const afterText = simulateSend(afterFailedImage2, null, 'u4', true)
    expect(afterText).toEqual(image1)
  })

  it('retrying a failed attachment succeeds and updates active attachment', () => {
    const image1: AttachmentState = { messageId: 'u2', base64: 'img1', mimeType: 'image/jpeg' }

    // First attempt: image2 fails
    const afterFail = simulateSend(image1, { base64: 'img2', mimeType: 'image/jpeg' }, 'u3', false)
    expect(afterFail).toEqual(image1) // unchanged

    // Retry: image2 succeeds
    const afterRetry = simulateSend(afterFail, { base64: 'img2', mimeType: 'image/jpeg' }, 'u5', true)
    expect(afterRetry).toEqual({ messageId: 'u5', base64: 'img2', mimeType: 'image/jpeg' })
  })
})

// ─── 5. normalizeRoles: defensive role deduplication ────────────────────────

describe('normalizeRoles', () => {
  it('is a no-op for already-alternating history', () => {
    const history: HistoryItem[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'bye' },
    ]
    expect(normalizeRoles(history)).toEqual(history)
  })

  it('collapses consecutive user messages, keeping the last', () => {
    const history: HistoryItem[] = [
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second' },
      { role: 'assistant', content: 'reply' },
    ]
    const result = normalizeRoles(history)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ role: 'user', content: 'second' })
    expect(result[1]).toEqual({ role: 'assistant', content: 'reply' })
  })

  it('collapses consecutive assistant messages, keeping the last', () => {
    const history: HistoryItem[] = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a1' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'follow-up' },
    ]
    const result = normalizeRoles(history)
    expect(result).toHaveLength(3)
    expect(result[1]).toEqual({ role: 'assistant', content: 'a2' })
  })

  it('handles empty array', () => {
    expect(normalizeRoles([])).toEqual([])
  })

  it('handles single message', () => {
    const h: HistoryItem[] = [{ role: 'user', content: 'hi' }]
    expect(normalizeRoles(h)).toEqual(h)
  })

  it('result never has consecutive same-role messages', () => {
    // Worst case: all same role
    const history: HistoryItem[] = [
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
      { role: 'user', content: 'c' },
    ]
    const result = normalizeRoles(history)
    expect(hasConsecutiveSameRole(result)).toBe(false)
    expect(result).toHaveLength(1)
  })
})
