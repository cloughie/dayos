'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, forwardRef, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import MarkdownContent from '@/components/ui/MarkdownContent'
import SettingsModal from '@/components/ui/SettingsModal'
import MemoryPanel from '@/components/ui/MemoryPanel'
import PlanPanel, { type SavedPlan } from '@/components/ui/PlanPanel'
import StreakBar, { getLocalWeekDays } from '@/components/ui/StreakBar'
import ThemeToggle from '@/components/ThemeToggle'
import type { Message } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { subscribeToPush, savePushSubscription } from '@/lib/push'
import { isNative, requestNativePermission, registerForNativePush } from '@/lib/nativePush'
import { hapticLight, hapticMedium, hapticSuccess, hapticWarning } from '@/lib/haptics'
import {
  validateFile,
  compressImage,
  readPdfAsBase64,
  getFileType,
  estimateCombinedRequestBytes,
  REQUEST_BUDGET_BYTES,
  TARGET_OUTPUT_BYTES,
} from '@/lib/attachments'

const STORAGE_KEY = 'dayos_conversation'
const PLAN_KEY = 'dayos_plan'
const STREAK_CACHE_KEY = 'dayos_streak_cache'

// Fire-and-forget analytics — never throws, never blocks UX
async function trackAnalyticsEvent(eventType: string, metadata?: Record<string, unknown>) {
  try {
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, ...(metadata && { metadata }) }),
    })
  } catch { /* ignore */ }
}

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

const PM_CHECKIN_PROMPT = `Let's check-in.

As a reminder, let's cover this in three stages:

The order of the 3 stages is important.

First I want to clear out how I am feeling emotionally.
Second, I want to reflect and learn from yesterday and today so far.
Third, I want to think about what I need from the rest of today.

Push my thinking a bit. Don't just reflect — tighten it and say the thing clearly when you see it.

For each stage, start with a question and let me fill in the blanks.

Never assume or start to build plans without my input first.

1. How am I feeling?

Start by asking me for:
* a score out of 10
* a few words describing my state

Then analyse my answer, reflect patterns, and ask clarifying questions if helpful.

2. How have things been going?

Help me reflect on yesterday and today so far. Identify wins, friction points, and anything that is still carrying forward.

3. What do I need from the rest of today?

Allow me first to get my ideas and thoughts out — and then work with me to shape a simple plan for the rest of the day.

Keep it proportionate to how much of the day is left. Don't force a full-day plan when it no longer makes sense.

When revising a plan — including any change to timing, sequencing, priorities, or what happens next in the day — always return the full updated plan, not just the changed section, so it can be saved cleanly.`

function isAfter2pm() {
  return new Date().getHours() >= 14
}

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

// ─── Safety strip ──────────────────────────────────────────────────────────
// Remove any line the model generates that begins with "User:" — these are
// hallucinated transcript continuations and should never appear in output.

function stripUserLines(text: string): string {
  return text
    .split('\n')
    .filter(line => !/^User:/i.test(line.trimStart()))
    .join('\n')
    .trim()
}

// ─── Image thumbnail (session-only — falls back to icon if blob URL is dead) ─

function ImageThumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 shrink-0">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    )
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="h-[72px] w-[72px] rounded-xl object-cover shrink-0"
    />
  )
}

// ─── Message bubble ────────────────────────────────────────────────────────

const MessageBubble = forwardRef<HTMLDivElement, { message: Message }>(
  ({ message }, ref) => {
    const isUser = message.role === 'user'

    if (isUser) {
      const imagePreviews = message.attachmentPreviews?.filter(p => p.type === 'image') ?? []
      const pdfPreviews = message.attachmentPreviews?.filter(p => p.type === 'pdf') ?? []
      return (
        <div ref={ref} className="flex justify-end mb-3">
          <div className="max-w-[80%] bg-zinc-800 rounded-2xl rounded-tr-sm px-4 py-3">
            {imagePreviews.length > 0 && (
              <div className="flex gap-2 mb-2 overflow-x-auto">
                {imagePreviews.map((preview, i) => (
                  <div key={i} className="shrink-0">
                    {preview.previewUrl
                      ? <ImageThumbnail src={preview.previewUrl} />
                      : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 shrink-0">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      )
                    }
                  </div>
                ))}
              </div>
            )}
            {pdfPreviews.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {pdfPreviews.map((preview, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="text-xs text-zinc-400 truncate max-w-[140px]">{preview.name}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      )
    }

    return (
      <div ref={ref} className="flex justify-start mb-3">
        <MarkdownContent
          content={message.content}
          className="max-w-[88%] text-zinc-100 text-sm leading-relaxed prose-assistant"
        />
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
  hasExistingData?: boolean
  broadcastId?: string
}

export default function ConversationClient({ userEmail, autoStart = false, hasExistingData = false, broadcastId }: ConversationClientProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [savedPlan, setSavedPlan] = useState<SavedPlan | null>(null)
  const [yesterdayPlan, setYesterdayPlan] = useState<SavedPlan | null>(null)
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Set synchronously in handleSend before any await so the attach button
  // onClick can read it on the very next event tick — before React has had
  // a chance to flush the isLoading state update to the DOM.
  const sendInProgressRef = useRef(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [showPushPrompt, setShowPushPrompt] = useState(false)
  const [aiConsent, setAiConsent] = useState<boolean | null>(null)
  const [showConsentOverlay, setShowConsentOverlay] = useState(false)
  const [streak, setStreak] = useState<number | null>(null)
  const [checkedInDays, setCheckedInDays] = useState<string[]>([])
  const [showAfternoonChoice, setShowAfternoonChoice] = useState(false)

  // ── Attachment state ────────────────────────────────────────────────────────
  // pendingAttachments: ephemeral composing state — up to 4 attachments per message.
  // Each has a local id for targeted removal. previewUrl is a revocable blob URL
  // for image thumbnails only. Never serialised to localStorage or Supabase.
  type PendingAttachment = {
    id: string
    base64: string
    mimeType: string
    name: string
    fileType: 'image' | 'pdf'
    previewUrl: string
  }
  // activeAttachments: the most recently sent group, kept in session memory so
  // follow-up turns can reference the same binaries. Replaced as a group when a
  // new set is sent. Never persisted to localStorage or Supabase.
  type StoredAttachment = {
    messageId: string
    base64: string
    mimeType: string
  }
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [activeAttachments, setActiveAttachments] = useState<StoredAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  // Computed synchronously — pure date math, no network needed.
  const tz = typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
  const localToday = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const weekDays = getLocalWeekDays(tz)

  // Hydrate from localStorage before first paint so dots are filled immediately
  // for returning users. useLayoutEffect fires synchronously before the browser paints.
  useLayoutEffect(() => {
    try {
      const cached = localStorage.getItem(STREAK_CACHE_KEY)
      if (cached) {
        const { streak: s, checkedInDays: d } = JSON.parse(cached)
        setStreak(s ?? 0)
        setCheckedInDays(d ?? [])
      }
    } catch { /* ignore malformed cache */ }
  }, [])

  // Fetch fresh data from the server; save result to cache for next load.
  const fetchStreak = useCallback(async () => {
    try {
      const r = await fetch(`/api/streak?tz=${encodeURIComponent(tz)}`)
      const data = await r.json()
      const s = data.streak ?? 0
      const d = data.checkedInDays ?? []
      setStreak(s)
      setCheckedInDays(d)
      localStorage.setItem(STREAK_CACHE_KEY, JSON.stringify({ streak: s, checkedInDays: d }))
    } catch {
      setStreak(prev => prev ?? 0)
    }
  }, [tz])

  // Record app open once per calendar day — drives DAU/WAU on the dashboard.
  // If the user arrived from a broadcast push, also record which broadcast they opened.
  useEffect(() => {
    const platform = (window as any).Capacitor?.isNativePlatform?.() ? 'ios' : 'web'
    trackAnalyticsEvent('app_opened', { platform })
    if (broadcastId) {
      trackAnalyticsEvent('push_broadcast_opened', { broadcast_id: broadcastId })
    }
    fetchStreak()
  }, [fetchStreak, broadcastId])

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
          if (convDate < today) {
            setShowNewDayBanner(true)
          } else {
            // Messages exist from today — this is a return visit; server deduplicates
            trackAnalyticsEvent('returned_same_day')
          }
        }
      } catch { /* ignore malformed */ }
    }

    // Seed from localStorage immediately so there's no flash
    const storedPlan = localStorage.getItem(PLAN_KEY)
    if (storedPlan) {
      try { setSavedPlan(JSON.parse(storedPlan)) } catch { /* ignore malformed */ }
    }

    // Supabase is the source of truth — overwrite localStorage cache if a newer plan exists.
    // If no plan exists for today, fetch yesterday's so it remains accessible during Stage 2.
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    fetch(`/api/plans?date=${today}`)
      .then(r => r.json())
      .then(({ plan }) => {
        if (plan) {
          setSavedPlan(plan)
          localStorage.setItem(PLAN_KEY, JSON.stringify(plan))
        } else {
          return fetch(`/api/plans?date=${yesterday}`)
            .then(r => r.json())
            .then(({ plan: yPlan }) => { if (yPlan) setYesterdayPlan(yPlan) })
        }
      })
      .catch(() => { /* keep localStorage value on network failure */ })

    // Fetch profile: check AI consent and push prompt state
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('push_notifications_enabled, has_seen_push_prompt, ai_data_sharing_consent')
        .eq('id', user.id)
        .single()

      // AI consent gate
      const consent = profile?.ai_data_sharing_consent ?? null
      setAiConsent(consent)
      if (consent === null) {
        setShowConsentOverlay(true)
      } else if (consent === true && autoStart && !hasStoredMessages) {
        handleStartCheckIn()
      }

      // Push prompt — only for web users who haven't been asked
      const browserPerm = typeof Notification !== 'undefined' ? Notification.permission : 'granted'
      if (browserPerm === 'default' && profile && !profile.push_notifications_enabled && !profile.has_seen_push_prompt) {
        setShowPushPrompt(true)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save to localStorage whenever messages change.
  // Strip previewUrl before serializing — data URIs can be large and blob URLs
  // are dead after a page reload, so neither is useful in persistent storage.
  // The message bubble falls back to the icon on reload, which is acceptable.
  useEffect(() => {
    const toSave = messages.map(m =>
      m.attachmentPreviews
        ? { ...m, attachmentPreviews: m.attachmentPreviews.map(({ previewUrl: _url, ...rest }) => rest) }
        : m
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
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
      handleStartCheckIn()
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
    hapticWarning()
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(PLAN_KEY)
    setMessages([])
    setSavedPlan(null)
    setNewCheckInConfirm(false)
    setShowNewDayBanner(false)
    setStarted(false)
    pendingAttachments.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    setPendingAttachments([])
    setActiveAttachments([])
    setAttachmentError(null)
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
    pendingAttachments.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    setPendingAttachments([])
    setActiveAttachments([])
    setAttachmentError(null)
    startNewDayRef.current = true
  }

  async function handlePushPromptYes() {
    setShowPushPrompt(false)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('user_profiles').update({ has_seen_push_prompt: true }).eq('id', user.id)
    }

    if (isNative()) {
      // Native iOS: fire haptic before the system dialog takes over, then request permission
      hapticLight()
      const permission = await requestNativePermission()
      if (permission !== 'granted') return
      const token = await registerForNativePush()
      if (!token) return
      await fetch('/api/push/register-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apns_token: token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      }).catch(() => null)
      return
    }

    // Web path: existing behaviour
    if (typeof Notification === 'undefined') return
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return
    const subscription = await subscribeToPush()
    if (!subscription) return
    await savePushSubscription(subscription)
    if (user) {
      await supabase.from('user_profiles').update({
        push_notifications_enabled: true,
        push_notifications_permission_status: 'granted',
      }).eq('id', user.id)
    }
  }

  async function handlePushPromptNo() {
    setShowPushPrompt(false)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('user_profiles').update({ has_seen_push_prompt: true }).eq('id', user.id)
    }
  }

  async function saveConsent(value: boolean) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('user_profiles')
      .update({ ai_data_sharing_consent: value })
      .eq('id', user.id)
    setAiConsent(value)
    setShowConsentOverlay(false)
  }

  // ─── Attachment handlers ───────────────────────────────────────────────────

  const MAX_ATTACHMENTS = 4

  async function handleAttachmentSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    // Reset so the same file can be re-selected
    e.target.value = ''
    if (files.length === 0) return

    setAttachmentError(null)

    // How many slots remain?
    const remaining = MAX_ATTACHMENTS - pendingAttachments.length
    if (remaining <= 0) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} files per message.`)
      return
    }
    const toProcess = files.slice(0, remaining)
    // Tell the user if we silently capped the selection
    if (files.length > remaining) {
      setAttachmentError(`Only the first ${remaining} file${remaining === 1 ? '' : 's'} were added — limit is ${MAX_ATTACHMENTS} per message.`)
    }

    // Scale compression target down when multiple images are being added so the
    // combined request stays within budget. Each image gets an equal share of
    // whatever base64 budget remains after accounting for already-pending files.
    const imageCountInBatch = toProcess.filter(f => getFileType(f) === 'image').length
    const existingBase64Sum = pendingAttachments.reduce((sum, a) => sum + a.base64.length, 0)
    const availableBase64 = REQUEST_BUDGET_BYTES - 200_000 - existingBase64Sum
    const perImageTargetBytes = Math.min(
      TARGET_OUTPUT_BYTES,
      Math.floor((availableBase64 / Math.max(imageCountInBatch, 1)) * 0.75),
    )

    const newAttachments: typeof pendingAttachments = []

    for (const file of toProcess) {
      const validation = validateFile(file)
      if (!validation.ok) {
        setAttachmentError(validation.error.message)
        continue
      }

      const fileType = getFileType(file)!

      if (fileType === 'image') {
        try {
          const { base64, mimeType } = await compressImage(file, perImageTargetBytes)
          // Check combined budget with everything so far
          const allBase64 = [...pendingAttachments, ...newAttachments].map(a => a.base64).concat(base64)
          if (estimateCombinedRequestBytes(allBase64) > REQUEST_BUDGET_BYTES) {
            setAttachmentError('Combined attachments are too large to send. Remove one or use smaller files.')
            break
          }
          const previewUrl = URL.createObjectURL(file)
          newAttachments.push({ id: crypto.randomUUID(), base64, mimeType, name: file.name, fileType: 'image', previewUrl })
        } catch {
          setAttachmentError('Could not process this image. Try a different file.')
        }
      } else {
        try {
          const base64 = await readPdfAsBase64(file)
          const allBase64 = [...pendingAttachments, ...newAttachments].map(a => a.base64).concat(base64)
          if (estimateCombinedRequestBytes(allBase64) > REQUEST_BUDGET_BYTES) {
            setAttachmentError('Combined attachments are too large to send. Remove one or use smaller files.')
            break
          }
          newAttachments.push({ id: crypto.randomUUID(), base64, mimeType: 'application/pdf', name: file.name, fileType: 'pdf', previewUrl: '' })
        } catch {
          setAttachmentError('Could not read this PDF. Try a different file.')
        }
      }
    }

    if (newAttachments.length > 0) {
      setPendingAttachments(prev => [...prev, ...newAttachments])
      hapticLight()
    }
  }

  function handleRemoveAttachment(id: string) {
    setPendingAttachments(prev => {
      const att = prev.find(a => a.id === id)
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl)
      return prev.filter(a => a.id !== id)
    })
    setAttachmentError(null)
  }

  // ─── Plan ─────────────────────────────────────────────────────────────────

  function savePlan(content: string, messageId: string) {
    const isUpdate = savedPlan !== null
    if (isUpdate) { hapticMedium() } else { hapticSuccess() }

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
    async (
      userContent: string,
      opts?: {
        // New attachments for this turn (from pendingAttachments, snapshotted by handleSend)
        newAttachments?: Array<{ id: string; base64: string; mimeType: string; name: string; fileType: 'image' | 'pdf'; previewUrl?: string }> | null
        hidden?: boolean
      },
    ): Promise<boolean> => {
      if (isLoading) return false

      const newAtts = opts?.newAttachments ?? null

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userContent,
        created_at: new Date().toISOString(),
        ...(opts?.hidden ? { hidden: true } : {}),
        // Persist only display metadata — no binaries.
        // previewUrl is a data URI (not the blob URL) so the thumbnail survives
        // blob revocation. It is stripped before localStorage serialization.
        ...(newAtts && newAtts.length > 0
          ? { attachmentPreviews: newAtts.map(a => ({ type: a.fileType, name: a.name, ...(a.fileType === 'image' && a.base64 ? { previewUrl: `data:${a.mimeType};base64,${a.base64}` } : {}) })) }
          : {}),
      }

      const updatedMessages = [...messages, userMessage]
      setMessages(updatedMessages)
      setIsLoading(true)

      // Determine which attachment binaries go to the API this turn:
      // - New attachments → replace the active group for this and future turns
      // - No new attachments → carry forward the existing active group (follow-up turn)
      const apiAttachments: Array<{ messageId: string; base64: string; mimeType: string }> = newAtts && newAtts.length > 0
        ? newAtts.map(a => ({ messageId: userMessage.id, base64: a.base64, mimeType: a.mimeType }))
        : activeAttachments.length > 0
        ? activeAttachments.map(a => ({ ...a }))
        : []

      let succeeded = false
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Strip attachmentPreviews before sending — they contain data URIs
            // that can be MB-scale and are pure display metadata the server ignores.
            // Omitting them keeps the request body well under Vercel's 4.5 MB limit.
            messages: updatedMessages.map(({ attachmentPreviews: _ap, ...m }) => m),
            ...(apiAttachments.length > 0 ? { attachments: apiAttachments } : {}),
            source: 'sendMessage',
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to get response')
        }

        const data = await response.json()
        const aiMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: stripUserLines(data.message),
          created_at: new Date().toISOString(),
        }

        const finalMessages = [...updatedMessages, aiMessage]
        hapticLight()
        setMessages(finalMessages)

        // Update active attachments only on success. Keeping this inside the try block
        // prevents a failed send from poisoning subsequent requests.
        if (newAtts && newAtts.length > 0) {
          setActiveAttachments(newAtts.map(a => ({ messageId: userMessage.id, base64: a.base64, mimeType: a.mimeType })))
        }

        succeeded = true

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
        // Roll back the user message so retry doesn't create a duplicate.
        // The error bubble is anchored to the pre-send history.
        setMessages([
          ...messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Sorry, something went wrong. Please try again.',
            created_at: new Date().toISOString(),
          },
        ])
      } finally {
        setIsLoading(false)
        // Skip auto-focus on native iOS — programmatic focus triggers the input accessory
        // bar to float over the input. User taps to type after reading the response.
        if (!(window as any).Capacitor?.isNativePlatform?.()) {
          requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
        }
      }
      return succeeded
    },
    [isLoading, messages, activeAttachments]
  )

  // ─── Handle send ──────────────────────────────────────────────────────────

  // startCheckIn must never read from the `messages` closure — doing so risks
  // stale React state carrying yesterday's conversation into a new check-in.
  // Instead it builds the API payload from a known empty array and owns the
  // full request/response cycle independently of sendMessage.
  async function startCheckIn() {
    if (isLoading) return
    hapticMedium()

    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`
    const day = now.toLocaleDateString('en-US', { weekday: 'long' })
    const monthDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    const content = `${CHECKIN_PROMPT}\n\nIt's ${time}, ${day}, ${monthDate}\n\nSo, let's check-in.`

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      hidden: true,
    }

    // Build from a local constant — never touches messages state
    const initialHistory: Message[] = [userMessage]

    setMessages(initialHistory)
    setIsLoading(true)
    setStarted(true)
    trackAnalyticsEvent('daily_checkin_started').then(() => fetchStreak())

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: initialHistory,
          source: 'startCheckIn',
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: stripUserLines(data.message),
        created_at: new Date().toISOString(),
      }

      hapticLight()
      setMessages([userMessage, aiMessage])
    } catch (err) {
      console.error('Chat error:', err)
      setMessages([
        userMessage,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setIsLoading(false)
      if (!(window as any).Capacitor?.isNativePlatform?.()) {
        requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
      }
    }

    // Persist usage signal so we never show the first-time screen again on
    // any device. Fire-and-forget — failure is silent and non-blocking.
    if (!hasExistingData) {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase
            .from('user_profiles')
            .update({ has_started_checkin: true })
            .eq('id', user.id)
            .then(() => {})
        }
      })
    }
  }

  async function startClearMyHead() {
    if (isLoading) return
    hapticMedium()

    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`
    const day = now.toLocaleDateString('en-US', { weekday: 'long' })
    const monthDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    const content = `${PM_CHECKIN_PROMPT}\n\nIt's ${time}, ${day}, ${monthDate}\n\nSo, let's check-in.`

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      hidden: true,
    }

    const initialHistory: Message[] = [userMessage]

    setMessages(initialHistory)
    setIsLoading(true)
    setStarted(true)
    setShowAfternoonChoice(false)
    trackAnalyticsEvent('daily_checkin_started').then(() => fetchStreak())

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: initialHistory,
          source: 'startClearMyHead',
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: stripUserLines(data.message),
        created_at: new Date().toISOString(),
      }

      hapticLight()
      setMessages([userMessage, aiMessage])
    } catch (err) {
      console.error('Chat error:', err)
      setMessages([
        userMessage,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setIsLoading(false)
      if (!(window as any).Capacitor?.isNativePlatform?.()) {
        requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
      }
    }

    if (!hasExistingData) {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase
            .from('user_profiles')
            .update({ has_started_checkin: true })
            .eq('id', user.id)
            .then(() => {})
        }
      })
    }
  }

  function handleStartCheckIn() {
    if (isAfter2pm()) {
      setShowAfternoonChoice(true)
    } else {
      startCheckIn()
    }
  }

  async function handleSend() {
    const trimmed = input.trim()
    if ((!trimmed && pendingAttachments.length === 0) || isLoading) return
    hapticMedium()

    // Mark send in progress synchronously — before any await and before React
    // flushes the isLoading state update. This prevents the attach button from
    // opening the native file picker (which would background the WKWebView and
    // abort the in-flight fetch) during the gap between this function starting
    // and isLoading being reflected in the DOM.
    sendInProgressRef.current = true

    // Snapshot before clearing so we can restore on failure.
    const atts = pendingAttachments
    setAttachmentError(null)

    // Force a synchronous DOM flush so the composer visually empties before
    // sendMessage queues its own state updates (user message + isLoading).
    // Without flushSync, React batches all four updates together and the
    // attachment strip stays visible until the combined render fires.
    flushSync(() => {
      setInput('')
      setPendingAttachments([])
    })

    try {
      const succeeded = await sendMessage(
        trimmed,
        atts.length > 0
          ? { newAttachments: atts.map(a => ({ id: a.id, base64: a.base64, mimeType: a.mimeType, name: a.name, fileType: a.fileType, previewUrl: a.previewUrl })) }
          : undefined,
      )

      if (succeeded) {
        // Message bubble now uses a data URI — the blob URL is no longer needed.
        // Revoke here (not on failure) so the restored composer still has
        // valid preview thumbnails for retry.
        atts.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
      } else {
        // Restore composer so the user can retry without retyping.
        // sendMessage already rolled back the user message from history,
        // so a retry won't create a duplicate.
        setInput(trimmed)
        setPendingAttachments(atts)
      }
    } finally {
      sendInProgressRef.current = false
    }
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
      hapticMedium()
      setVoiceState('recording')
    } catch (err) {
      console.error('[Voice] Failed to start recording:', err)
      setVoiceState('idle')
    }
  }

  function cancelRecording() {
    hapticLight()
    cancelledRef.current = true
    mediaRecorderRef.current?.stop()
    setVoiceState('idle')
  }

  function confirmRecording() {
    hapticMedium()
    cancelledRef.current = false
    setVoiceState('transcribing')
    mediaRecorderRef.current?.stop()
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col h-screen h-[100dvh] bg-zinc-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4 border-b border-[color:var(--divider)] safe-top shrink-0">
        <h1 className="text-base font-semibold text-white tracking-tight">DayOS</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => !showNewDayBanner && setPlanOpen(true)}
            className={`text-sm font-medium text-zinc-300 hover:text-white transition-colors px-2 py-1${showNewDayBanner ? ' pointer-events-none' : ''}`}
          >
            View Plan
          </button>
          <ThemeToggle />
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

        {/* Weekly check-in strip — scrolls with content */}
        {weekDays.length === 7 && (
          <StreakBar
            weekDays={weekDays}
            today={localToday}
            checkedInDays={checkedInDays}
            streak={streak ?? 0}
          />
        )}

        {messages.length === 0 && !isLoading && !started && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 pb-12">
            {showAfternoonChoice ? (
              <>
                <p className="text-white font-medium text-base mb-2">How would you like to check in?</p>
                <p className="text-zinc-500 text-sm mb-8">It&apos;s afternoon — pick whichever fits.</p>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={startCheckIn}
                    className="bg-white text-zinc-950 rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
                  >
                    Full check-in
                  </button>
                  <button
                    type="button"
                    onClick={startClearMyHead}
                    className="bg-zinc-800 text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
                  >
                    Clear my head
                  </button>
                </div>
              </>
            ) : (
              <>
                {hasExistingData ? (
                  <p className="text-white font-medium text-base mb-8">Ready to start today&apos;s check-in?</p>
                ) : (
                  <>
                    <p className="text-white font-medium text-base mb-1">Ready to start your first check-in?</p>
                    <p className="text-zinc-500 text-sm mb-8">Best experienced properly in the morning when planning your day.</p>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleStartCheckIn}
                  className="bg-white text-zinc-950 rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
                >
                  Start check-in
                </button>
              </>
            )}
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
                <div className="flex flex-col items-start gap-2 mt-4 mb-4">
                  {savedPlanMessageId === message.id ? (
                    <span className="flex items-center gap-1.5 text-xs text-zinc-600 border border-zinc-800 rounded-full px-3 py-1.5">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Today&apos;s plan updated
                    </span>
                  ) : (
                    <>
                      {!savedPlan && <p className="text-xs text-zinc-500">Revisit and update this plan throughout the day.</p>}
                      <button
                        type="button"
                        onClick={() => savePlan(extractPlan(message.content), message.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-white bg-zinc-600 hover:bg-zinc-500 active:bg-zinc-600 rounded-full px-4 py-2 shadow-sm transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                          <polyline points="17 21 17 13 7 13 7 21" />
                          <polyline points="7 3 7 8 15 8" />
                        </svg>
                        {savedPlan ? 'Update today\'s plan' : 'Save today\'s plan'}
                      </button>
                    </>
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
          <div className="flex flex-col gap-2">
            {/* Attachment error — above the composer */}
            {attachmentError && (
              <p className="text-xs text-red-400 px-1">{attachmentError}</p>
            )}

            {/* Composer — attachment strip + controls live inside one rounded container */}
            <div className="bg-zinc-900 rounded-2xl">
              {/* Attachment strip — horizontally scrollable, inside the composer */}
              {pendingAttachments.length > 0 && (
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 overflow-x-auto">
                  {pendingAttachments.map(att => (
                    <div key={att.id} className="relative shrink-0">
                      {att.fileType === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={att.previewUrl}
                          alt=""
                          className="h-[72px] w-[72px] rounded-xl object-cover border border-zinc-700"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5 bg-zinc-800 rounded-xl px-2.5 py-2 max-w-[150px]">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 shrink-0">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span className="text-xs text-zinc-300 truncate">{att.name}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        disabled={isLoading}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-zinc-600 text-zinc-200 hover:bg-zinc-500 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        aria-label="Remove attachment"
                      >
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {pendingAttachments.length > 1 && (
                    <span className="text-xs text-zinc-500 shrink-0 self-center">{pendingAttachments.length} of {MAX_ATTACHMENTS}</span>
                  )}
                </div>
              )}

              {/* Controls row */}
              <div className="flex items-end gap-2 px-3 py-2">
                {/* Attachment button */}
                <button
                  type="button"
                  onClick={() => { if (!sendInProgressRef.current) fileInputRef.current?.click() }}
                  disabled={isLoading || showNewDayBanner || pendingAttachments.length >= MAX_ATTACHMENTS}
                  className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 text-zinc-400 hover:text-white transition-colors disabled:opacity-30 mb-0.5"
                  aria-label="Attach image or PDF"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>

                {/* Hidden file input — multiple allows selecting several files at once */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                  className="hidden"
                  onChange={handleAttachmentSelect}
                />

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
                  disabled={isLoading || showNewDayBanner || (!input.trim() && pendingAttachments.length === 0)}
                  className="w-8 h-8 flex items-center justify-center bg-white text-zinc-950 rounded-full shrink-0 transition-opacity disabled:opacity-30 mb-0.5"
                  aria-label="Send message"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI consent blocked state — shown when user has declined */}
      {aiConsent === false && !showConsentOverlay && (
        <div className="absolute inset-0 z-20 backdrop-blur-[3px] bg-zinc-950/80 flex flex-col items-center justify-center text-center px-8">
          <p className="text-white font-medium text-base mb-2">AI features unavailable</p>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            DayOS requires permission to send your check-in messages to Anthropic, PBC in order to generate responses. No data has been sent.
          </p>
          <button
            type="button"
            onClick={() => setShowConsentOverlay(true)}
            className="bg-white text-zinc-950 rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
          >
            Review and Allow
          </button>
        </div>
      )}

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

      {/* AI consent overlay — shown when consent is null (not yet asked) or when reviewing after decline */}
      {showConsentOverlay && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" aria-hidden="true" />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-800 rounded-2xl p-7 flex flex-col gap-5 max-w-sm mx-auto">
            <div>
              <h2 className="text-base font-semibold text-white mb-3">Before we continue</h2>
              <p className="text-sm text-zinc-300 leading-relaxed mb-4">
                DayOS sends information to <span className="text-zinc-200 font-medium">Anthropic, PBC</span> (Claude) to generate responses during your check-ins.
              </p>
              <div className="bg-zinc-800/60 rounded-xl divide-y divide-zinc-700/50 mb-4">
                {[
                  'Your messages during a conversation',
                  'Your preferred name',
                  'Your saved memories',
                  'Images or documents you choose to attach',
                ].map(item => (
                  <div key={item} className="flex items-start gap-2.5 px-3.5 py-2.5">
                    <span className="text-zinc-500 mt-px shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <p className="text-sm text-zinc-300">{item}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Nothing is sent until you tap Allow. If you decline, DayOS cannot generate AI responses.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => saveConsent(true)}
                className="w-full py-2.5 rounded-xl bg-white text-sm text-zinc-950 font-semibold hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
              >
                Allow
              </button>
              <button
                type="button"
                onClick={() => saveConsent(false)}
                className="w-full py-2.5 rounded-xl border border-zinc-700 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
              >
                Not Now
              </button>
            </div>
          </div>
        </>
      )}

      {/* Push prompt — shown once to existing users who haven't been asked */}
      {showPushPrompt && !isLoading && !started && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" aria-hidden="true" />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-800 rounded-2xl p-7 flex flex-col gap-6 max-w-sm mx-auto">
            <div>
              <h2 className="text-base font-semibold text-white mb-3">Want a morning reminder?</h2>
              <p className="text-sm text-zinc-300 leading-relaxed mb-4">
                DayOS works best as a daily habit.<br />
                Get a notification each morning to remind you to check in.
              </p>
              <p className="text-xs text-zinc-400">You can change this anytime in Settings.</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handlePushPromptYes}
                className="w-full py-2.5 rounded-xl bg-white text-sm text-zinc-950 font-semibold hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
              >
                Yes, remind me
              </button>
              <button
                type="button"
                onClick={handlePushPromptNo}
                className="w-full py-2.5 rounded-xl border border-zinc-700 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </>
      )}

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
        yesterdayPlan={yesterdayPlan}
      />

      {/* Settings modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userEmail={userEmail}
        onMemoryOpen={() => { setSettingsOpen(false); setMemoryOpen(true) }}
        onPrivacyOpen={() => { setSettingsOpen(false); router.push('/privacy') }}
      />

      {/* Memory panel */}
      <MemoryPanel
        isOpen={memoryOpen}
        onClose={() => setMemoryOpen(false)}
      />
    </div>
  )
}
