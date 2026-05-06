'use client'

import { useState, useEffect, useRef, useCallback, forwardRef, useMemo } from 'react'
import { flushSync } from 'react-dom'
import SettingsModal from '@/components/ui/SettingsModal'
import MemoryPanel from '@/components/ui/MemoryPanel'
import PlanPanel, { type SavedPlan } from '@/components/ui/PlanPanel'
import type { Message } from '@/lib/types'

const STORAGE_KEY = 'dayos_conversation'
const PLAN_KEY = 'dayos_plan'

const CHECKIN_PROMPT = `Good morning, let's check-in.

As a reminder, let's cover this in three stages:

The order of the 3 stages is important.

First I want to clear out how I am feeling emotionally.
Second, I want to reflect and learn from yesterday.
Third, I want to look forward and make decisions for how I spend my time today.

Push my thinking a bit. Don't just reflect — tighten it and say the thing clearly when you see it.

For each stage, start with a question and let me fill in the blanks.
Never assume or start to build plans without my input first.

1. How am I feeling?

Start by asking me for:

* a score out of 10
* a few words describing my state

Then analyse my answer, reflect patterns, and ask clarifying questions if helpful.

2. How did yesterday go?
Identify wins, friction points, and what carries forward.

3. What should today look like?
Allow me first to get my ideas and thoughts out — and then work with me to shape into:
- a mental cue
- 2–3 top wins
- morning / afternoon / evening blocks with light structure
- 2–3 guardrails

When revising a plan — including any change to timing, sequencing, priorities, or what happens next in the day — always return the full updated plan, not just the changed section, so it can be saved cleanly.`

// ─── Plan detection ────────────────────────────────────────────────────────
// Returns true when an assistant message contains a finalised daily plan.
// Requires at least 2 of 4 structural signals to avoid false positives during
// Stage 1 / Stage 2 or when the assistant asks a clarifying question.

function looksLikePlan(content: string): boolean {
  const c = content.toLowerCase()
  let signals = 0
  if (c.includes('mental cue') || c.includes('mindset cue'))                         signals++
  if (c.includes('morning') && (c.includes('afternoon') || c.includes('evening')))   signals++
  if (c.includes('top win') || c.includes('top 2') || c.includes('top 3'))           signals++
  if (c.includes('guardrail'))                                                         signals++
  return signals >= 2
}

// ─── Plan extraction ───────────────────────────────────────────────────────
// Strips conversational filler before/after the plan block.
// Finds the first plan section header as the start, and includes everything
// up to the end of the guardrails section. Falls back to the full message
// so the user never loses the ability to save.

function extractPlan(content: string): string {
  const lines = content.split('\n')
  const sectionRe = /mental cue|mindset cue|top win|top [23]\b|morning|afternoon|evening|guardrail/i

  // Start: first line containing a known plan section keyword
  const startIdx = lines.findIndex(l => sectionRe.test(l))
  if (startIdx === -1) return content

  // End: guardrails section (last expected section)
  let guardrailIdx = -1
  for (let i = startIdx; i < lines.length; i++) {
    if (/guardrail/i.test(lines[i])) guardrailIdx = i
  }
  if (guardrailIdx === -1) return content

  // Extend past the guardrails header to include its content lines,
  // stopping at the first blank line (where conversational outro begins)
  let endIdx = guardrailIdx
  for (let i = guardrailIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') break
    endIdx = i
  }

  return lines.slice(startIdx, endIdx + 1).join('\n').trim()
}

// ─── Message bubble ────────────────────────────────────────────────────────

const MessageBubble = forwardRef<HTMLDivElement, { message: Message }>(
  ({ message }, ref) => {
    const isUser = message.role === 'user'

    if (isUser) {
      return (
        <div ref={ref} className="flex justify-end mb-3">
          <div className="max-w-[80%] bg-zinc-800 rounded-2xl rounded-tr-sm px-4 py-3">
            <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      )
    }

    return (
      <div ref={ref} className="flex justify-start mb-3">
        <div className="max-w-[88%]">
          <p className="text-zinc-100 text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }
)
MessageBubble.displayName = 'MessageBubble'

// ─── Typing indicator ──────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="flex items-center gap-1 px-1 py-2">
        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  )
}


// ─── Main component ────────────────────────────────────────────────────────

interface ConversationClientProps {
  userEmail: string
  autoStart?: boolean
}

export default function ConversationClient({ userEmail, autoStart = false }: ConversationClientProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [savedPlan, setSavedPlan] = useState<SavedPlan | null>(null)
  const [savedPlanMessageId, setSavedPlanMessageId] = useState<string | null>(null)
  const [newCheckInConfirm, setNewCheckInConfirm] = useState(false)
  const [showNewDayBanner, setShowNewDayBanner] = useState(false)
  const [started, setStarted] = useState(false)
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false)

  // ID of the most recent assistant message that contains a plan.
  // Stays stable as subsequent messages arrive — only updates when a newer plan appears.
  const latestPlanMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && looksLikePlan(messages[i].content)) {
        return messages[i].id
      }
    }
    return null
  }, [messages])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastAssistantRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const startNewDayRef = useRef(false)
  const prevLoadingRef = useRef(false)
  const initialScrollDoneRef = useRef(false)
  const [showScrollButton, setShowScrollButton] = useState(false)

  // Load from localStorage on mount, then hydrate plan from Supabase
  useEffect(() => {
    let hasStoredMessages = false
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed: Message[] = JSON.parse(stored)
        setMessages(parsed)
        hasStoredMessages = parsed.length > 0
        // Show new-day banner if the stored conversation is from a previous local date
        if (parsed.length > 0) {
          const today = new Date().toLocaleDateString('en-CA')         // YYYY-MM-DD
          const convDate = new Date(parsed[0].created_at).toLocaleDateString('en-CA')
          if (convDate < today) setShowNewDayBanner(true)
        }
      } catch { /* ignore malformed */ }
    }

    // Seed from localStorage immediately so there's no flash
    const storedPlan = localStorage.getItem(PLAN_KEY)
    if (storedPlan) {
      try { setSavedPlan(JSON.parse(storedPlan)) } catch { /* ignore malformed */ }
    }

    // Supabase is the source of truth — overwrite localStorage cache if a newer plan exists
    const today = new Date().toISOString().split('T')[0]
    fetch(`/api/plans?date=${today}`)
      .then(r => r.json())
      .then(({ plan }) => {
        if (plan) {
          setSavedPlan(plan)
          localStorage.setItem(PLAN_KEY, JSON.stringify(plan))
        }
      })
      .catch(() => { /* keep localStorage value on network failure */ })

    // First-time user arriving from onboarding — start check-in automatically
    if (autoStart && !hasStoredMessages) {
      startCheckIn()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save to localStorage whenever messages change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

  // Check MediaRecorder support
  useEffect(() => {
    setHasSpeechSupport(typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia)
  }, [])

  // Scroll to bottom once on initial load from localStorage
  useEffect(() => {
    if (messages.length > 0 && !initialScrollDoneRef.current) {
      messagesEndRef.current?.scrollIntoView()
      initialScrollDoneRef.current = true
    }
  }, [messages])

  // Scroll behaviour on loading transitions
  useEffect(() => {
    if (isLoading && !prevLoadingRef.current) {
      // Started loading: scroll down to show the typing indicator
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else if (!isLoading && prevLoadingRef.current) {
      // Response arrived: scroll to the top of the new assistant message
      lastAssistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    prevLoadingRef.current = isLoading
  }, [isLoading])

  // Auto-start check-in after new-day clear — runs once messages is empty post-reset
  useEffect(() => {
    if (startNewDayRef.current && messages.length === 0 && !isLoading) {
      startNewDayRef.current = false
      startCheckIn()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoading])

  function handleScroll() {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollButton(distanceFromBottom > 80)
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const maxHeight = 4 * 24 + 24 // ~4 lines
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px'
  }, [input])

  // ─── New check-in ─────────────────────────────────────────────────────────

  function handleNewCheckIn() {
    if (messages.length > 0) {
      setNewCheckInConfirm(true)
      return
    }
    clearCheckIn()
  }

  function clearCheckIn() {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(PLAN_KEY)
    setMessages([])
    setSavedPlan(null)
    setNewCheckInConfirm(false)
    setShowNewDayBanner(false)
    setStarted(false)
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
  }

  function handleNewDayStart() {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(PLAN_KEY)
    setMessages([])
    setSavedPlan(null)
    setNewCheckInConfirm(false)
    setShowNewDayBanner(false)
    setStarted(false)
    startNewDayRef.current = true
  }

  function savePlan(content: string, messageId: string) {
    const date = new Date().toISOString().split('T')[0]
    const plan: SavedPlan = {
      content,
      date,
      savedAt: new Date().toISOString(),
    }
    // Immediate local update so UI responds instantly
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan))
    setSavedPlan(plan)
    setSavedPlanMessageId(messageId)

    // Persist to Supabase — source of truth for cross-device / cross-context sync
    fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, date }),
    })
      .then(r => r.json())
      .then(({ savedAt }) => {
        if (savedAt) {
          const synced = { ...plan, savedAt }
          localStorage.setItem(PLAN_KEY, JSON.stringify(synced))
          setSavedPlan(synced)
        }
      })
      .catch(err => console.error('[Plans] Failed to sync to Supabase:', err))
  }

  // ─── Send message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (userContent: string, hidden?: boolean) => {
      if (isLoading) return

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userContent,
        created_at: new Date().toISOString(),
        ...(hidden ? { hidden: true } : {}),
      }

      const updatedMessages = [...messages, userMessage]
      setMessages(updatedMessages)
      setIsLoading(true)
      setInput('')

      try {
        // Build a local datetime string at send time so the model always has
        // accurate, timezone-aware context — server time would be UTC and wrong.
        const now = new Date()
        const clientTime = [
          now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        ].join(', ')

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: updatedMessages, clientTime }),
        })

        if (!response.ok) {
          throw new Error('Failed to get response')
        }

        const data = await response.json()
        const aiMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.message,
          created_at: new Date().toISOString(),
        }

        const finalMessages = [...updatedMessages, aiMessage]
        setMessages(finalMessages)

        // Fire-and-forget memory extraction — only every 8 messages to avoid redundant extraction
        if (finalMessages.length >= 8 && finalMessages.length % 8 === 0) {
          fetch('/api/memories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: finalMessages.slice(-10).map(m => ({
                role: m.role,
                content: m.content,
              })),
            }),
          }).catch(() => {})
        } else if (process.env.NODE_ENV === 'development') {
          console.log(`[Memory] Extraction skipped (message count: ${finalMessages.length})`)
        }
      } catch (err) {
        console.error('Chat error:', err)
        setMessages([
          ...updatedMessages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Sorry, something went wrong. Please try again.',
            created_at: new Date().toISOString(),
          },
        ])
      } finally {
        flushSync(() => setIsLoading(false))
        requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
      }
    },
    [isLoading, messages]
  )

  // ─── Handle send ──────────────────────────────────────────────────────────

  function startCheckIn() {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`
    const day = now.toLocaleDateString('en-US', { weekday: 'long' })
    const monthDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    const message = `${CHECKIN_PROMPT}\n\nIt's ${time}, ${day}, ${monthDate}\n\nSo, let's check-in.`
    setStarted(true)
    sendMessage(message, true)
  }

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    sendMessage(trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Send on Cmd+Enter (desktop convenience); plain Enter always inserts a newline
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─── Voice input ──────────────────────────────────────────────────────────

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      cancelledRef.current = false

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())

        if (cancelledRef.current) return // discarded — stay idle

        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        if (blob.size === 0) {
          setVoiceState('idle')
          return
        }

        const formData = new FormData()
        formData.append('audio', blob, `recording.${mimeType === 'audio/webm' ? 'webm' : 'ogg'}`)

        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.text) {
            setInput(prev => prev ? prev + ' ' + data.text : data.text)
          }
        } catch (err) {
          console.error('[Voice] Transcription error:', err)
        } finally {
          setVoiceState('idle')
          requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setVoiceState('recording')
    } catch (err) {
      console.error('[Voice] Failed to start recording:', err)
      setVoiceState('idle')
    }
  }

  function cancelRecording() {
    cancelledRef.current = true
    mediaRecorderRef.current?.stop()
    setVoiceState('idle')
  }

  function confirmRecording() {
    cancelledRef.current = false
    setVoiceState('transcribing')
    mediaRecorderRef.current?.stop()
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col h-screen h-[100dvh] bg-zinc-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4 border-b border-zinc-900 safe-top shrink-0">
        <h1 className="text-base font-semibold text-white tracking-tight">DayOS</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => !showNewDayBanner && setPlanOpen(true)}
            className={`text-sm font-medium text-zinc-300 hover:text-white transition-colors px-2 py-1${showNewDayBanner ? ' pointer-events-none' : ''}`}
          >
            View Plan
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          aria-label="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>


      {/* Body — relative so the new-day overlay can be positioned within it */}
      <div className="relative flex-1 flex flex-col min-h-0">

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {(
        <>

        {messages.length === 0 && !isLoading && !started && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 pb-12">
            <p className="text-white font-medium text-base mb-1">Start today&apos;s check-in</p>
            <p className="text-zinc-500 text-sm mb-8">Clear your head and decide what matters today.</p>
            <button
              type="button"
              onClick={startCheckIn}
              className="bg-white text-zinc-950 rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
            >
              Begin
            </button>
          </div>
        )}

        {messages.map((message, i) => {
          if (message.hidden) return null
          const isLastAssistant = message.role === 'assistant' && i === messages.length - 1
          return (
            <div key={message.id}>
              <MessageBubble
                message={message}
                ref={isLastAssistant ? lastAssistantRef : null}
              />
              {message.id === latestPlanMessageId && !isLoading && (
                <div className="flex justify-start mt-3 mb-4">
                  {savedPlanMessageId === message.id ? (
                    <span className="flex items-center gap-1.5 text-xs text-zinc-600 border border-zinc-800 rounded-full px-3 py-1.5">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Today&apos;s plan updated
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => savePlan(extractPlan(message.content), message.id)}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded-full px-3 py-1.5 transition-colors"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                      {savedPlan ? 'Update today\'s plan' : 'Save as today\'s plan'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {isLoading && <TypingIndicator />}

        </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Jump to bottom */}
      {showScrollButton && !showNewDayBanner && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-20 right-4 z-10 w-8 h-8 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-full shadow-lg text-zinc-400 hover:text-white transition-colors"
          aria-label="Scroll to bottom"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        </button>
      )}

      {/* Input bar */}
      <div className="shrink-0 border-t border-zinc-900 bg-zinc-950 px-3 py-3 safe-bottom">
        {voiceState !== 'idle' ? (
          /* ── Recording mode ── */
          <div className="flex items-center gap-3 bg-zinc-900 rounded-2xl px-3 py-2 h-[48px]">
            {/* Cancel */}
            <button
              type="button"
              onClick={cancelRecording}
              disabled={voiceState === 'transcribing'}
              className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white transition-colors disabled:opacity-30 shrink-0"
              aria-label="Cancel recording"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Waveform / status */}
            <div className="flex-1 flex items-center justify-center gap-1">
              {voiceState === 'recording' ? (
                [0, 150, 75, 225, 100].map((delay, i) => (
                  <span
                    key={i}
                    className="w-0.5 h-4 bg-red-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))
              ) : (
                <span className="text-xs text-zinc-400 animate-pulse">Processing…</span>
              )}
            </div>

            {/* Confirm */}
            <button
              type="button"
              onClick={confirmRecording}
              disabled={voiceState === 'transcribing'}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-zinc-900 transition-opacity disabled:opacity-30 shrink-0"
              aria-label="Confirm recording"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>
        ) : (
          /* ── Normal input mode ── */
          <div className="flex items-end gap-2 bg-zinc-900 rounded-2xl px-3 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Say something…"
              disabled={isLoading || showNewDayBanner}
              rows={1}
              className="flex-1 bg-transparent text-white text-sm placeholder-zinc-500 focus:outline-none leading-6 py-1 min-h-[32px] max-h-[120px] overflow-y-auto disabled:opacity-50"
            />

            {/* Mic button */}
            {hasSpeechSupport && (
              <button
                type="button"
                onClick={startRecording}
                disabled={isLoading || showNewDayBanner}
                className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 text-zinc-400 hover:text-white transition-colors disabled:opacity-30 mb-0.5"
                aria-label="Start voice input"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="11" rx="3" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              </button>
            )}

            {/* Send button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading || showNewDayBanner || !input.trim()}
              className="w-8 h-8 flex items-center justify-center bg-white rounded-full shrink-0 transition-opacity disabled:opacity-30 mb-0.5"
              aria-label="Send message"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#09090b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* New-day overlay — sits above scroll area + input bar, below header */}
      {showNewDayBanner && (
        <div className="absolute inset-0 z-20 backdrop-blur-[3px] bg-zinc-950/60 flex flex-col items-center justify-center text-center px-6">
          <p className="text-white font-medium text-base mb-2">Ready to start today&apos;s check-in?</p>
          <button
            type="button"
            onClick={handleNewDayStart}
            className="bg-white text-zinc-950 rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
          >
            Start check-in
          </button>
        </div>
      )}

      </div>{/* /body wrapper */}

      {/* New check-in confirmation */}
      {newCheckInConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            onClick={() => setNewCheckInConfirm(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4 max-w-sm mx-auto">
            <div>
              <h2 className="text-base font-semibold text-white mb-1">Start a new check-in?</h2>
              <p className="text-sm text-zinc-400">This will replace your current plan.</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setNewCheckInConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearCheckIn}
                className="flex-1 py-2.5 rounded-xl bg-white text-sm text-zinc-900 font-medium hover:bg-zinc-200 transition-colors"
              >
                Start
              </button>
            </div>
          </div>
        </>
      )}

      {/* Plan panel */}
      <PlanPanel
        isOpen={planOpen}
        onClose={() => setPlanOpen(false)}
        plan={savedPlan}
      />

      {/* Settings modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userEmail={userEmail}
        onMemoryOpen={() => { setSettingsOpen(false); setMemoryOpen(true) }}
      />

      {/* Memory panel */}
      <MemoryPanel
        isOpen={memoryOpen}
        onClose={() => setMemoryOpen(false)}
      />
    </div>
  )
}
