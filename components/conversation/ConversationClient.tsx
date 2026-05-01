'use client'

import { useState, useEffect, useRef, useCallback, forwardRef } from 'react'
import { flushSync } from 'react-dom'
import SettingsModal from '@/components/ui/SettingsModal'
import MemoryPanel from '@/components/ui/MemoryPanel'
import PlanPanel, { type SavedPlan } from '@/components/ui/PlanPanel'
import type { Message } from '@/lib/types'

const STORAGE_KEY = 'dayos_conversation'
const PLAN_KEY = 'dayos_plan'

// ─── Check-in prompt ───────────────────────────────────────────────────────
// {{CURRENT_TIME_DAY_DATE}} is replaced at runtime with the user's local time.
// Do not modify the wording of this prompt.

const CHECK_IN_PROMPT = `Good morning, let's check-in.

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
- 2-3 guardrails

When revising a plan, return the full updated plan.

It's {{CURRENT_TIME_DAY_DATE}}.

So, let's check-in.`

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
}

export default function ConversationClient({ userEmail }: ConversationClientProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [savedPlan, setSavedPlan] = useState<SavedPlan | null>(null)
  const [newCheckInConfirm, setNewCheckInConfirm] = useState(false)
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastAssistantRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const prevLoadingRef = useRef(false)
  const initialScrollDoneRef = useRef(false)
  const [showScrollButton, setShowScrollButton] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try { setMessages(JSON.parse(stored)) } catch { /* ignore malformed */ }
    }
    const storedPlan = localStorage.getItem(PLAN_KEY)
    if (storedPlan) {
      try { setSavedPlan(JSON.parse(storedPlan)) } catch { /* ignore malformed */ }
    }
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
    if (savedPlan) {
      setNewCheckInConfirm(true)
      return
    }
    if (messages.length > 0 && !confirm('Start a new check-in? This will clear the current conversation.')) return
    clearCheckIn()
  }

  function buildCheckInPrompt(): string {
    const now = new Date()
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    const day = now.toLocaleDateString([], { weekday: 'short' })
    const date = now.toLocaleDateString([], { month: 'long', day: 'numeric' })
    return CHECK_IN_PROMPT.replace('{{CURRENT_TIME_DAY_DATE}}', `${time} ${day}, ${date}`)
  }

  async function triggerCheckIn() {
    setIsLoading(true)
    const hiddenPrompt = buildCheckInPrompt()

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The prompt is sent as the conversation but never added to messages state,
        // so it does not appear in the chat UI.
        body: JSON.stringify({ messages: [{ role: 'user', content: hiddenPrompt }] }),
      })

      if (!response.ok) throw new Error('Failed to start check-in')

      const data = await response.json()
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message,
        created_at: new Date().toISOString(),
      }
      setMessages([aiMessage])
    } catch (err) {
      console.error('Check-in start error:', err)
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, something went wrong starting your check-in. Please try again.',
        created_at: new Date().toISOString(),
      }])
    } finally {
      flushSync(() => setIsLoading(false))
      requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
    }
  }

  function clearCheckIn() {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(PLAN_KEY)
    setMessages([])
    setSavedPlan(null)
    setNewCheckInConfirm(false)
    triggerCheckIn()
  }

  function savePlan(content: string) {
    const plan: SavedPlan = {
      content,
      date: new Date().toISOString().split('T')[0],
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan))
    setSavedPlan(plan)
  }

  // ─── Send message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (userContent: string) => {
      if (isLoading) return

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userContent,
        created_at: new Date().toISOString(),
      }

      const updatedMessages = [...messages, userMessage]
      setMessages(updatedMessages)
      setIsLoading(true)
      setInput('')

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: updatedMessages }),
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
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-white tracking-tight">DayOS</h1>
          <button
            onClick={handleNewCheckIn}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            New check-in
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPlanOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            aria-label="Today's Plan"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <line x1="9" y1="7" x2="15" y2="7" />
              <line x1="9" y1="11" x2="15" y2="11" />
              <line x1="9" y1="15" x2="13" y2="15" />
            </svg>
          </button>
          <button
            onClick={() => setMemoryOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            aria-label="Memory"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a5 5 0 0 1 5 5c0 1.9-.8 3.5-2 4.6V13a3 3 0 0 1-3 3 3 3 0 0 1-3-3v-1.4A6 6 0 0 1 7 7a5 5 0 0 1 5-5z" />
              <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
            </svg>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          aria-label="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </button>
        </div>
      </header>

      {/* Device-only storage notice */}
      <p className="shrink-0 text-center text-[10px] text-zinc-700 py-1 px-4">
        Saved on this device only. Avoid switching devices or logging out during a check-in.
      </p>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.map((message, i) => {
          const isLastAssistant = message.role === 'assistant' && i === messages.length - 1
          return (
            <div key={message.id}>
              <MessageBubble
                message={message}
                ref={isLastAssistant ? lastAssistantRef : null}
              />
              {isLastAssistant && !isLoading && (
                <div className="flex justify-start mb-4 -mt-1 pl-1">
                  <button
                    type="button"
                    onClick={() => savePlan(message.content)}
                    className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    {savedPlan ? 'Update today\'s plan' : 'Save as today\'s plan'}
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {isLoading && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* Jump to bottom */}
      {showScrollButton && (
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
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-transparent text-white text-sm placeholder-zinc-500 focus:outline-none leading-6 py-1 min-h-[32px] max-h-[120px] overflow-y-auto disabled:opacity-50"
            />

            {/* Mic button */}
            {hasSpeechSupport && (
              <button
                type="button"
                onClick={startRecording}
                disabled={isLoading}
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
              disabled={isLoading || !input.trim()}
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
      />

      {/* Memory panel */}
      <MemoryPanel
        isOpen={memoryOpen}
        onClose={() => setMemoryOpen(false)}
      />
    </div>
  )
}
