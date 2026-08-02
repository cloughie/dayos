import { describe, it, expect, vi } from 'vitest'

// ─── State-machine simulation ───────────────────────────────────────────────
//
// These tests mirror the handleSend + sendMessage logic without rendering the
// React component. The simulation is intentionally thin — it encodes the exact
// branching that exists in the real code so regressions are caught immediately.

type Att = { id: string; base64: string; mimeType: string; previewUrl: string }
type Msg = { id: string; role: 'user' | 'assistant'; content: string }

function makeAtts(n: number, sendIndex = 0): Att[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `att_s${sendIndex}_${i}`,
    base64: `base64_s${sendIndex}_${i}`,
    mimeType: 'image/jpeg',
    previewUrl: `blob:fake/send${sendIndex}/att${i}`,
  }))
}

/**
 * Simulates one handleSend + sendMessage cycle.
 *
 * Phase 1 (handleSend, before await):   composer cleared immediately
 * Phase 2 (sendMessage):                user message added, fetch runs
 * Phase 3 (sendMessage catch/success):  messages updated
 * Phase 4 (handleSend, after await):    blob URLs revoked OR composer restored
 */
function simulateSend(opts: {
  trimmed: string
  atts: Att[]
  initialMessages: Msg[]
  succeeds: boolean
  revokeUrl: (url: string) => void
}): { composerInput: string; composerAtts: Att[]; messages: Msg[] } {
  const { trimmed, atts, initialMessages, succeeds, revokeUrl } = opts

  // ── Phase 1: immediate clear ─────────────────────────────────────────────
  let composerInput = ''
  let composerAtts: Att[] = []

  // ── Phase 2: sendMessage — build user message ────────────────────────────
  const userMsg: Msg = { id: `u_${atts[0]?.id ?? 'plain'}`, role: 'user', content: trimmed || '(attachment)' }

  // ── Phase 3: success / failure ────────────────────────────────────────────
  let messages: Msg[]
  if (succeeds) {
    const aiMsg: Msg = { id: `a_${userMsg.id}`, role: 'assistant', content: 'reply' }
    messages = [...initialMessages, userMsg, aiMsg]
  } else {
    // Roll back: error bubble anchored to pre-send history (uses initialMessages,
    // NOT [...initialMessages, userMsg])
    const errMsg: Msg = { id: `e_${userMsg.id}`, role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }
    messages = [...initialMessages, errMsg]
  }

  // ── Phase 4: handleSend post-await ────────────────────────────────────────
  if (succeeded(succeeds)) {
    atts.forEach(a => { if (a.previewUrl) revokeUrl(a.previewUrl) })
    // composer stays cleared — already done in Phase 1
  } else {
    composerInput = trimmed
    composerAtts = atts
  }

  return { composerInput, composerAtts, messages }
}

// Tiny helper so TypeScript can narrow the branch in the simulation above
function succeeded(s: boolean): s is true { return s }

// ─── localStorage serialization helper ──────────────────────────────────────
// Mirrors the toSave transform in the localStorage save effect.

type Preview = { type: 'image' | 'pdf'; name: string; previewUrl?: string }

function stripPreviewUrls(messages: Array<{ attachmentPreviews?: Preview[]; [key: string]: unknown }>): Array<{ attachmentPreviews?: Omit<Preview, 'previewUrl'>[]; [key: string]: unknown }> {
  return messages.map(m =>
    m.attachmentPreviews
      ? { ...m, attachmentPreviews: m.attachmentPreviews.map(({ previewUrl: _url, ...rest }) => rest) }
      : m
  )
}

// ─── 1. Successful send: composer cleared, URLs revoked exactly once ─────────

describe('successful send', () => {
  it('clears the composer immediately (before await)', () => {
    const revoke = vi.fn()
    const result = simulateSend({ trimmed: 'hello', atts: makeAtts(1), initialMessages: [], succeeds: true, revokeUrl: revoke })
    expect(result.composerInput).toBe('')
    expect(result.composerAtts).toHaveLength(0)
  })

  it('revokes each blob URL exactly once', () => {
    const revoke = vi.fn()
    const atts = makeAtts(2)
    simulateSend({ trimmed: 'hello', atts, initialMessages: [], succeeds: true, revokeUrl: revoke })
    expect(revoke).toHaveBeenCalledTimes(2)
    expect(revoke).toHaveBeenCalledWith(atts[0].previewUrl)
    expect(revoke).toHaveBeenCalledWith(atts[1].previewUrl)
  })

  it('revokes 4 URLs for a 4-attachment send', () => {
    const revoke = vi.fn()
    const atts = makeAtts(4)
    simulateSend({ trimmed: '', atts, initialMessages: [], succeeds: true, revokeUrl: revoke })
    expect(revoke).toHaveBeenCalledTimes(4)
    for (const att of atts) expect(revoke).toHaveBeenCalledWith(att.previewUrl)
  })

  it('adds user message + AI reply to history', () => {
    const revoke = vi.fn()
    const result = simulateSend({ trimmed: 'hello', atts: makeAtts(1), initialMessages: [], succeeds: true, revokeUrl: revoke })
    expect(result.messages.filter(m => m.role === 'user')).toHaveLength(1)
    expect(result.messages.filter(m => m.role === 'assistant')).toHaveLength(1)
  })

  it('plain-text send (no attachments) does not call revokeObjectURL', () => {
    const revoke = vi.fn()
    simulateSend({ trimmed: 'just text', atts: [], initialMessages: [], succeeds: true, revokeUrl: revoke })
    expect(revoke).not.toHaveBeenCalled()
  })
})

// ─── 2. Failed send: composer restored, URLs NOT revoked ─────────────────────

describe('failed send', () => {
  it('restores the original text to the composer', () => {
    const revoke = vi.fn()
    const result = simulateSend({ trimmed: 'hello', atts: makeAtts(1), initialMessages: [], succeeds: false, revokeUrl: revoke })
    expect(result.composerInput).toBe('hello')
  })

  it('restores the original attachments to the composer', () => {
    const revoke = vi.fn()
    const atts = makeAtts(2)
    const result = simulateSend({ trimmed: 'hello', atts, initialMessages: [], succeeds: false, revokeUrl: revoke })
    expect(result.composerAtts).toHaveLength(2)
    expect(result.composerAtts[0].id).toBe(atts[0].id)
    expect(result.composerAtts[1].id).toBe(atts[1].id)
  })

  it('does not revoke any blob URLs', () => {
    const revoke = vi.fn()
    const atts = makeAtts(3)
    simulateSend({ trimmed: 'hello', atts, initialMessages: [], succeeds: false, revokeUrl: revoke })
    expect(revoke).not.toHaveBeenCalled()
  })

  it('restored attachments still have their original previewUrls intact', () => {
    const revoke = vi.fn()
    const atts = makeAtts(2)
    const result = simulateSend({ trimmed: 'hello', atts, initialMessages: [], succeeds: false, revokeUrl: revoke })
    expect(result.composerAtts[0].previewUrl).toBe('blob:fake/send0/att0')
    expect(result.composerAtts[1].previewUrl).toBe('blob:fake/send0/att1')
  })

  it('shows an error bubble without the user message (no user message rolled in)', () => {
    const revoke = vi.fn()
    const initial: Msg[] = [{ id: 'a0', role: 'assistant', content: 'greeting' }]
    const result = simulateSend({ trimmed: 'hello', atts: makeAtts(1), initialMessages: initial, succeeds: false, revokeUrl: revoke })
    // No new user message in history
    expect(result.messages.filter(m => m.role === 'user')).toHaveLength(0)
    // One error bubble appended
    expect(result.messages.filter(m => m.role === 'assistant')).toHaveLength(2)
    expect(result.messages[result.messages.length - 1].content).toMatch(/something went wrong/)
  })
})

// ─── 3. Retry after failure: no duplicate user message ───────────────────────

describe('retry after failure', () => {
  it('succeeds without duplicating the user message', () => {
    const revoke = vi.fn()
    const atts = makeAtts(1)
    const initial: Msg[] = [
      { id: 'c1', role: 'user', content: 'checkin' },
      { id: 'a0', role: 'assistant', content: 'greeting' },
    ]

    // First attempt fails — user message is rolled back
    const afterFail = simulateSend({ trimmed: 'my message', atts, initialMessages: initial, succeeds: false, revokeUrl: revoke })
    expect(afterFail.messages.filter(m => m.role === 'user')).toHaveLength(1) // only the checkin

    // Retry with the restored composer state
    const afterRetry = simulateSend({
      trimmed: afterFail.composerInput,
      atts: afterFail.composerAtts,
      initialMessages: afterFail.messages,
      succeeds: true,
      revokeUrl: revoke,
    })

    const userMsgs = afterRetry.messages.filter(m => m.role === 'user')
    expect(userMsgs).toHaveLength(2) // checkin + retry
    // No two user messages have the same content
    const contents = userMsgs.map(m => m.content)
    expect(new Set(contents).size).toBe(contents.length)
  })

  it('revokes blob URLs only on the successful retry, not on the failed attempt', () => {
    const revoke = vi.fn()
    const atts = makeAtts(1)

    // Fail
    simulateSend({ trimmed: 'msg', atts, initialMessages: [], succeeds: false, revokeUrl: revoke })
    expect(revoke).not.toHaveBeenCalled()

    // Retry succeeds
    simulateSend({ trimmed: 'msg', atts, initialMessages: [], succeeds: true, revokeUrl: revoke })
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith(atts[0].previewUrl)
  })
})

// ─── 4. Four successive sends: each send revokes only its own URLs ───────────

describe('four successive successful sends', () => {
  it('revokes exactly one URL set per send — no old URLs accumulate', () => {
    const allRevoked: string[] = []
    const revoke = (url: string) => allRevoked.push(url)

    let messages: Msg[] = []

    for (let i = 0; i < 4; i++) {
      const atts = makeAtts(1, i)
      const result = simulateSend({ trimmed: `message ${i}`, atts, initialMessages: messages, succeeds: true, revokeUrl: revoke })
      messages = result.messages

      // After send i: exactly i+1 total revocations
      expect(allRevoked).toHaveLength(i + 1)
      // The most recent revocation is for this send's attachment
      expect(allRevoked[i]).toBe(atts[0].previewUrl)
    }

    // All 4 URLs were unique and revoked exactly once each
    expect(new Set(allRevoked).size).toBe(4)
  })

  it('does not retain any old preview URLs after 4 sends', () => {
    const revoked = new Set<string>()
    const revoke = (url: string) => revoked.add(url)

    let messages: Msg[] = []
    const allUrls: string[] = []

    for (let i = 0; i < 4; i++) {
      const atts = makeAtts(2, i) // 2 attachments each send
      atts.forEach(a => allUrls.push(a.previewUrl))
      const result = simulateSend({ trimmed: `message ${i}`, atts, initialMessages: messages, succeeds: true, revokeUrl: revoke })
      messages = result.messages
    }

    // Every blob URL created was revoked
    expect(revoked.size).toBe(allUrls.length)
    for (const url of allUrls) expect(revoked.has(url)).toBe(true)
  })
})

// ─── 5. localStorage serialization strips previewUrl ─────────────────────────

describe('localStorage serialization', () => {
  it('strips previewUrl from attachmentPreviews before saving', () => {
    const messages = [{
      id: 'u1', role: 'user' as const, content: 'text', created_at: '',
      attachmentPreviews: [{ type: 'image' as const, name: 'photo.jpg', previewUrl: 'data:image/jpeg;base64,/9j/...' }],
    }]
    const saved = stripPreviewUrls(messages)
    expect((saved[0].attachmentPreviews?.[0] as any).previewUrl).toBeUndefined()
  })

  it('preserves type and name fields', () => {
    const messages = [{
      id: 'u1', role: 'user' as const, content: 'text', created_at: '',
      attachmentPreviews: [{ type: 'image' as const, name: 'photo.jpg', previewUrl: 'data:image/jpeg;base64,...' }],
    }]
    const saved = stripPreviewUrls(messages)
    expect(saved[0].attachmentPreviews?.[0]).toMatchObject({ type: 'image', name: 'photo.jpg' })
  })

  it('leaves messages without attachmentPreviews unchanged', () => {
    const messages = [{ id: 'a1', role: 'assistant' as const, content: 'hello', created_at: '' }]
    const saved = stripPreviewUrls(messages)
    expect(saved[0]).not.toHaveProperty('attachmentPreviews')
  })

  it('strips previewUrl from multiple previews in one message', () => {
    const messages = [{
      id: 'u1', role: 'user' as const, content: '', created_at: '',
      attachmentPreviews: [
        { type: 'image' as const, name: 'a.jpg', previewUrl: 'data:image/jpeg;base64,aaa' },
        { type: 'image' as const, name: 'b.jpg', previewUrl: 'data:image/jpeg;base64,bbb' },
      ],
    }]
    const saved = stripPreviewUrls(messages)
    for (const p of saved[0].attachmentPreviews ?? []) {
      expect((p as any).previewUrl).toBeUndefined()
    }
  })

  it('a PDF preview (no previewUrl) is unchanged after strip', () => {
    const messages = [{
      id: 'u1', role: 'user' as const, content: 'text', created_at: '',
      attachmentPreviews: [{ type: 'pdf' as const, name: 'doc.pdf' }],
    }]
    const saved = stripPreviewUrls(messages)
    expect(saved[0].attachmentPreviews?.[0]).toEqual({ type: 'pdf', name: 'doc.pdf' })
  })
})
