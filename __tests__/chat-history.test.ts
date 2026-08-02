import { describe, it, expect } from 'vitest'
import { buildHistory, normalizeRoles, type RawMessage, type HistoryItem, type AttachmentPayload } from '../lib/chat-history'

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

// ─── 3. Single attachment (backward-compatible array with 1 item) ────────────

describe('single attachment (array API)', () => {
  const attachment: AttachmentPayload = { messageId: 'u2', base64: 'fakebase64', mimeType: 'image/jpeg' }

  it('applies multimodal blocks to the matching message only', () => {
    const msgs = [
      user('c1', 'checkin'), assistant('a0', 'hi'),
      user('u2', 'look at this'),
      assistant('a2', 'I see the image'),
      user('u3', 'follow-up'),
    ]
    const history = buildHistory(msgs, [attachment])
    const imgMsg = history.find(m => m.role === 'user' && Array.isArray(m.content))
    expect(imgMsg).toBeDefined()
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
    const history = buildHistory(msgs, [attachment])
    const plainUserMsgs = history.filter(m => m.role === 'user' && !Array.isArray(m.content))
    expect(plainUserMsgs.length).toBeGreaterThanOrEqual(1)
    plainUserMsgs.forEach(m => expect(typeof m.content).toBe('string'))
  })

  it('omits text block when user content is empty string (avoids confusing model)', () => {
    const msgs = [user('u1', ''), assistant('a1', 'hi'), user('u2', '')]
    const history = buildHistory(msgs, [{ messageId: 'u2', base64: 'b64', mimeType: 'image/png' }])
    const imgMsg = history.find(m => Array.isArray(m.content)) as { role: 'user'; content: Array<{ type: string; text?: string }> }
    expect(imgMsg).toBeDefined()
    const textBlock = imgMsg!.content.find(b => b.type === 'text')
    expect(textBlock).toBeUndefined()
  })

  it('attachment not applied when messageId is not in the sliced window', () => {
    const msgs = makeConversation(11) // 24 messages; u1 not in slice(-20)
    const staleAttachment: AttachmentPayload = { messageId: 'u1', base64: 'b64', mimeType: 'image/jpeg' }
    const history = buildHistory(msgs, [staleAttachment])
    expect(history.every(m => !Array.isArray(m.content))).toBe(true)
  })

  it('second attachment group replaces first — first message reverts to plain text', () => {
    const msgs = [
      user('c1', 'checkin'), assistant('a0', 'hi'),
      user('u2', 'image 1 text'), assistant('a2', 'I see image 1'),
      user('u3', 'image 2 text'), assistant('a3', 'I see image 2'),
      user('u4', 'follow-up'),
    ]
    // Active attachment is now image2 (u3); image1 (u2) should be plain text
    const image2: AttachmentPayload = { messageId: 'u3', base64: 'img2base64', mimeType: 'image/jpeg' }
    const history = buildHistory(msgs, [image2])

    const u2Entry = history.find(m => typeof m.content === 'string' && m.content === 'image 1 text')
    expect(u2Entry).toBeDefined()
    expect(typeof u2Entry!.content).toBe('string')

    const u3Entry = history.find(m => Array.isArray(m.content))
    expect(u3Entry).toBeDefined()
  })

  it('undefined attachments is treated as no-op', () => {
    const msgs = [user('u1', 'hi'), assistant('a1', 'hello')]
    const history = buildHistory(msgs, undefined)
    expect(history.every(m => !Array.isArray(m.content))).toBe(true)
  })

  it('empty attachments array is treated as no-op', () => {
    const msgs = [user('u1', 'hi'), assistant('a1', 'hello')]
    const history = buildHistory(msgs, [])
    expect(history.every(m => !Array.isArray(m.content))).toBe(true)
  })
})

// ─── 4. Multiple attachments per message ────────────────────────────────────

describe('multiple attachments per message', () => {
  it('2 attachments on same message emit 2 media blocks + 1 text block', () => {
    const msgs = [user('u1', 'look at both'), assistant('a1', 'I see them')]
    const attachments: AttachmentPayload[] = [
      { messageId: 'u1', base64: 'b1', mimeType: 'image/jpeg' },
      { messageId: 'u1', base64: 'b2', mimeType: 'image/png' },
    ]
    const history = buildHistory(msgs, attachments)
    const u1 = history.find(m => Array.isArray(m.content))
    expect(u1).toBeDefined()
    const blocks = u1!.content as Array<{ type: string }>
    expect(blocks).toHaveLength(3) // 2 images + 1 text
    expect(blocks[0].type).toBe('image')
    expect(blocks[1].type).toBe('image')
    expect(blocks[2].type).toBe('text')
  })

  it('3 attachments on same message emit 3 media blocks + 1 text block', () => {
    const msgs = [user('u1', 'three files')]
    const attachments: AttachmentPayload[] = [
      { messageId: 'u1', base64: 'b1', mimeType: 'image/jpeg' },
      { messageId: 'u1', base64: 'b2', mimeType: 'image/jpeg' },
      { messageId: 'u1', base64: 'b3', mimeType: 'image/png' },
    ]
    const history = buildHistory(msgs, attachments)
    const blocks = history[0].content as Array<{ type: string }>
    expect(blocks).toHaveLength(4)
    expect(blocks.filter(b => b.type === 'image')).toHaveLength(3)
    expect(blocks[3].type).toBe('text')
  })

  it('4 attachments on same message emit 4 media blocks + 1 text block', () => {
    const msgs = [user('u1', 'four files')]
    const attachments: AttachmentPayload[] = [
      { messageId: 'u1', base64: 'b1', mimeType: 'image/jpeg' },
      { messageId: 'u1', base64: 'b2', mimeType: 'image/jpeg' },
      { messageId: 'u1', base64: 'b3', mimeType: 'image/png' },
      { messageId: 'u1', base64: 'b4', mimeType: 'image/webp' },
    ]
    const history = buildHistory(msgs, attachments)
    const blocks = history[0].content as Array<{ type: string }>
    expect(blocks).toHaveLength(5)
    expect(blocks.filter(b => b.type === 'image')).toHaveLength(4)
    expect(blocks[4].type).toBe('text')
  })

  it('mixed image and PDF attachments on same message', () => {
    const msgs = [user('u1', 'image and pdf')]
    const attachments: AttachmentPayload[] = [
      { messageId: 'u1', base64: 'img', mimeType: 'image/jpeg' },
      { messageId: 'u1', base64: 'pdf', mimeType: 'application/pdf' },
    ]
    const history = buildHistory(msgs, attachments)
    const blocks = history[0].content as Array<{ type: string }>
    expect(blocks).toHaveLength(3)
    expect(blocks[0].type).toBe('image')
    expect(blocks[1].type).toBe('document')
    expect(blocks[2].type).toBe('text')
  })

  it('attachments on different messages each get their own blocks', () => {
    const msgs = [
      user('u1', 'first'),
      assistant('a1', 'ok'),
      user('u2', 'second'),
    ]
    const attachments: AttachmentPayload[] = [
      { messageId: 'u1', base64: 'img1', mimeType: 'image/jpeg' },
      { messageId: 'u2', base64: 'img2', mimeType: 'image/png' },
    ]
    const history = buildHistory(msgs, attachments)
    const multimodalMsgs = history.filter(m => Array.isArray(m.content))
    expect(multimodalMsgs).toHaveLength(2)
    for (const m of multimodalMsgs) {
      const blocks = m.content as Array<{ type: string }>
      expect(blocks[blocks.length - 1].type).toBe('text')
    }
  })

  it('group replacement: new group on u3, u2 falls back to plain text', () => {
    const msgs = [
      user('c1', 'checkin'), assistant('a0', 'hi'),
      user('u2', 'first group'), assistant('a2', 'reply'),
      user('u3', 'second group'), assistant('a3', 'reply'),
      user('u4', 'follow-up'),
    ]
    // Active attachments now point to u3; u2 should be plain text
    const group2: AttachmentPayload[] = [
      { messageId: 'u3', base64: 'img2a', mimeType: 'image/jpeg' },
      { messageId: 'u3', base64: 'img2b', mimeType: 'image/png' },
    ]
    const history = buildHistory(msgs, group2)

    const u2 = history.find(m => typeof m.content === 'string' && m.content === 'first group')
    expect(u2).toBeDefined()

    const u3 = history.find(m => Array.isArray(m.content))
    expect(u3).toBeDefined()
    const blocks = u3!.content as Array<{ type: string }>
    expect(blocks.filter(b => b.type === 'image')).toHaveLength(2)
  })

  it('attachments beyond the 20-message window are silently ignored', () => {
    const msgs = makeConversation(11) // 24 messages; u1 not in slice(-20)
    const staleGroup: AttachmentPayload[] = [
      { messageId: 'u1', base64: 'b1', mimeType: 'image/jpeg' },
      { messageId: 'u1', base64: 'b2', mimeType: 'image/png' },
    ]
    const history = buildHistory(msgs, staleGroup)
    expect(history.every(m => !Array.isArray(m.content))).toBe(true)
  })

  it('omits text block when content is empty with multiple attachments', () => {
    const msgs = [user('u1', '')]
    const attachments: AttachmentPayload[] = [
      { messageId: 'u1', base64: 'b1', mimeType: 'image/jpeg' },
      { messageId: 'u1', base64: 'b2', mimeType: 'image/png' },
    ]
    const history = buildHistory(msgs, attachments)
    const blocks = history[0].content as Array<{ type: string; text?: string }>
    expect(blocks.filter(b => b.type === 'image')).toHaveLength(2)
    expect(blocks.find(b => b.type === 'text')).toBeUndefined()
  })
})

// ─── 5. activeAttachment state machine ──────────────────────────────────────

describe('activeAttachments state machine', () => {
  type AttGroup = Array<{ messageId: string; base64: string; mimeType: string }> | null

  function simulateSend(
    currentActive: AttGroup,
    newAtts: Array<{ base64: string; mimeType: string }> | null,
    messageId: string,
    succeeds: boolean,
  ): AttGroup {
    if (succeeds && newAtts && newAtts.length > 0) {
      return newAtts.map(a => ({ messageId, base64: a.base64, mimeType: a.mimeType }))
    }
    return currentActive
  }

  it('successful send with new attachments updates active group', () => {
    const result = simulateSend(null, [{ base64: 'img1', mimeType: 'image/jpeg' }], 'msg1', true)
    expect(result).toEqual([{ messageId: 'msg1', base64: 'img1', mimeType: 'image/jpeg' }])
  })

  it('successful send with 2 attachments stores both in active group', () => {
    const result = simulateSend(
      null,
      [{ base64: 'img1', mimeType: 'image/jpeg' }, { base64: 'img2', mimeType: 'image/png' }],
      'msg1',
      true,
    )
    expect(result).toHaveLength(2)
    expect(result![0].messageId).toBe('msg1')
    expect(result![1].messageId).toBe('msg1')
  })

  it('failed send with new attachments does NOT update active group', () => {
    const prev: AttGroup = [{ messageId: 'prev', base64: 'img0', mimeType: 'image/jpeg' }]
    const result = simulateSend(prev, [{ base64: 'img1', mimeType: 'image/jpeg' }], 'msg1', false)
    expect(result).toEqual(prev)
  })

  it('failed send preserves null active group', () => {
    const result = simulateSend(null, [{ base64: 'img1', mimeType: 'image/jpeg' }], 'msg1', false)
    expect(result).toBeNull()
  })

  it('text message send (no new attachments) never changes active group', () => {
    const prev: AttGroup = [{ messageId: 'u2', base64: 'img1', mimeType: 'image/jpeg' }]
    const successResult = simulateSend(prev, null, 'u3', true)
    const failResult = simulateSend(prev, null, 'u3', false)
    expect(successResult).toEqual(prev)
    expect(failResult).toEqual(prev)
  })

  it('retrying a failed multi-attachment send succeeds and updates group', () => {
    const group1: AttGroup = [{ messageId: 'u2', base64: 'img1', mimeType: 'image/jpeg' }]
    const group2 = [{ base64: 'img2a', mimeType: 'image/jpeg' }, { base64: 'img2b', mimeType: 'image/png' }]

    // First attempt fails
    const afterFail = simulateSend(group1, group2, 'u3', false)
    expect(afterFail).toEqual(group1) // unchanged

    // Retry succeeds
    const afterRetry = simulateSend(afterFail, group2, 'u5', true)
    expect(afterRetry).toHaveLength(2)
    expect(afterRetry![0].messageId).toBe('u5')
    expect(afterRetry![1].messageId).toBe('u5')
  })
})

// ─── 6. Remove attachment during send ───────────────────────────────────────
//
// Simulates pressing X on the thumbnail while a request is in-flight.
// The X button is now disabled={isLoading}, so this can no longer happen via
// normal UI. These tests confirm the state-machine and history-building
// invariants that MUST hold regardless, and serve as a regression guard.

describe('remove attachment during send', () => {
  // Re-use the simulateSend helper shape inline for clarity.
  type AttGroup = Array<{ messageId: string; base64: string; mimeType: string }> | null

  function simulateSend(
    currentActive: AttGroup,
    newAtts: Array<{ base64: string; mimeType: string }> | null,
    messageId: string,
    succeeds: boolean,
  ): AttGroup {
    if (succeeds && newAtts && newAtts.length > 0) {
      return newAtts.map(a => ({ messageId, base64: a.base64, mimeType: a.mimeType }))
    }
    return currentActive
  }

  // --- activeAttachments state machine -----------------------------------------

  it('failed send (X mid-send, request errors) does NOT set activeAttachments', () => {
    // activeAttachments is null before any send
    const result = simulateSend(null, [{ base64: 'img1', mimeType: 'image/jpeg' }], 'msg1', false)
    expect(result).toBeNull()
  })

  it('failed send does NOT overwrite an existing active group', () => {
    const existing: AttGroup = [{ messageId: 'prev', base64: 'prev_img', mimeType: 'image/jpeg' }]
    const result = simulateSend(existing, [{ base64: 'new_img', mimeType: 'image/jpeg' }], 'msg2', false)
    expect(result).toEqual(existing)
  })

  it('successful send (X pressed but request already completed) sets activeAttachments', () => {
    const result = simulateSend(null, [{ base64: 'img1', mimeType: 'image/jpeg' }], 'msg1', true)
    expect(result).toEqual([{ messageId: 'msg1', base64: 'img1', mimeType: 'image/jpeg' }])
  })

  // --- history after a failed mid-send -----------------------------------------

  it('subsequent plain-text send after failed attachment send produces valid history', () => {
    // Conversation: checkin → reply → user sends image (fails) → error reply → user retries with text
    const msgs: RawMessage[] = [
      user('c1', 'checkin'), assistant('a0', 'greeting'),
      user('u1', 'here is an image'),
      assistant('e1', 'Sorry, something went wrong. Please try again.'),
      user('u2', 'ok let me try text instead'),
    ]
    // activeAttachments stayed null after the failed send; no attachments passed
    const history = buildHistory(msgs, [])
    expect(firstRole(history)).toBe('user')
    expect(hasConsecutiveSameRole(history)).toBe(false)
    // No multimodal blocks — plain text only
    expect(history.every(m => !Array.isArray(m.content))).toBe(true)
    // Final message is the user's text retry
    const last = history[history.length - 1]
    expect(last.role).toBe('user')
    expect(last.content).toBe('ok let me try text instead')
  })

  it('subsequent plain-text send produces no multimodal blocks when activeAttachments is null', () => {
    // sendMessage carry-forward: newAtts=null, activeAttachments=null → apiAttachments=[]
    const msgs: RawMessage[] = [
      user('u1', 'image attempt'), assistant('e1', 'Something went wrong. Please try again.'),
      user('u2', 'follow-up text'),
    ]
    const history = buildHistory(msgs, []) // [] matches apiAttachments=[]
    expect(history.every(m => !Array.isArray(m.content))).toBe(true)
  })

  // --- history after a successful send where X was pressed ---------------------

  it('after successful mid-X send, carry-forward correctly attaches binary to the original message', () => {
    // The request completed (X was cosmetic), activeAttachments was set.
    // Next turn: no new attachments → carry forward the active group.
    const msgs: RawMessage[] = [
      user('c1', 'checkin'), assistant('a0', 'hi'),
      user('u1', 'look at this image'), assistant('a1', 'I can see it'),
      user('u2', 'follow-up question'),
    ]
    // activeAttachments: [{ messageId: 'u1', ... }] carried forward to next request
    const carryForward: AttachmentPayload[] = [
      { messageId: 'u1', base64: 'img_binary', mimeType: 'image/jpeg' },
    ]
    const history = buildHistory(msgs, carryForward)
    // u1 gets the multimodal block
    const u1Entry = history.find(m => Array.isArray(m.content))
    expect(u1Entry).toBeDefined()
    const blocks = u1Entry!.content as Array<{ type: string }>
    expect(blocks[0].type).toBe('image')
    // u2 (follow-up) remains plain text
    const u2Entry = history.find(m => typeof m.content === 'string' && m.content === 'follow-up question')
    expect(u2Entry).toBeDefined()
    // No consecutive same-role messages
    expect(hasConsecutiveSameRole(history)).toBe(false)
  })

  it('conversation is still valid after multiple failed sends followed by a plain-text success', () => {
    // Stress-test: 3 failed attachment sends, then a working text message
    const msgs: RawMessage[] = [
      user('c1', 'checkin'), assistant('a0', 'greeting'),
      user('f1', 'attempt 1'), assistant('e1', 'Sorry, something went wrong. Please try again.'),
      user('f2', 'attempt 2'), assistant('e2', 'Sorry, something went wrong. Please try again.'),
      user('f3', 'attempt 3'), assistant('e3', 'Sorry, something went wrong. Please try again.'),
      user('u1', 'plain text works'),
    ]
    const history = buildHistory(msgs)
    expect(firstRole(history)).toBe('user')
    expect(hasConsecutiveSameRole(history)).toBe(false)
    expect(history.every(m => !Array.isArray(m.content))).toBe(true)
    const last = history[history.length - 1]
    expect(last.role).toBe('user')
    expect(last.content).toBe('plain text works')
  })
})

// ─── 7. normalizeRoles: defensive role deduplication ────────────────────────

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

// ─── 6. Empty-content user messages (attachment-only turns) ────────────────
describe('empty content fallback', () => {
  it('attachment-only turn in history gets (attachment) fallback on next send', () => {
    // Simulates: user sends image with no text → content is '' in messages state.
    // On the next turn, buildHistory must not emit content: '' (Anthropic rejects it).
    const msgs: RawMessage[] = [
      user('c1', 'checkin'),
      assistant('a0', 'greeting'),
      user('u1', ''),          // image sent with no text
      assistant('a1', 'nice photo!'),
      user('u2', ''),          // PDF sent with no text
    ]
    const atts: AttachmentPayload[] = [
      { messageId: 'u2', base64: 'pdfbase64', mimeType: 'application/pdf' },
    ]
    const result = buildHistory(msgs, atts)
    // u1 should have fallback text, not empty string
    const u1 = result.find(m => m.role === 'user' && typeof m.content === 'string' && m.content === '')
    expect(u1).toBeUndefined()
    // No user message should have empty string content
    result.forEach(m => {
      if (m.role === 'user') {
        if (typeof m.content === 'string') expect(m.content).not.toBe('')
        if (Array.isArray(m.content)) {
          const textBlock = m.content.find((b: any) => b.type === 'text')
          if (textBlock) expect((textBlock as any).text).not.toBe('')
        }
      }
    })
  })

  it('attachment-only turn uses (attachment) fallback string', () => {
    const msgs: RawMessage[] = [
      user('u1', ''),
      assistant('a1', 'reply'),
    ]
    const result = buildHistory(msgs)
    expect(result[0]).toEqual({ role: 'user', content: '(attachment)' })
  })
})
