'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import SettingsModal from '@/components/ui/SettingsModal'
import MemoryPanel from '@/components/ui/MemoryPanel'
import type { Message } from '@/lib/types'

const STORAGE_KEY = 'dayos_conversation'

// ─── Message bubble ────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[80%] bg-zinc-800 rounded-2xl rounded-tr-sm px-4 py-3">
          <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[88%]">
        <p className="text-zinc-100 text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}

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
  const [isListening, setIsListening] = useState(false)
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setMessages(JSON.parse(stored))
      } catch {
        // ignore malformed storage
      }
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

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
    if (messages.length > 0 && !confirm('Start a new check-in? This will clear the current conversation.')) return
    localStorage.removeItem(STORAGE_KEY)
    setMessages([])
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

  async function toggleListening() {
    console.log('[Voice] Mic button clicked, isListening:', isListening)

    if (isListening) {
      console.log('[Voice] Stopping recording')
      mediaRecorderRef.current?.stop()
      setIsListening(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        // Stop all mic tracks to release the mic indicator
        stream.getTracks().forEach(t => t.stop())

        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        console.log('[Voice] Recording stopped, blob size:', blob.size, 'type:', blob.type)

        if (blob.size === 0) {
          console.warn('[Voice] Empty audio blob, skipping transcription')
          return
        }

        const formData = new FormData()
        // Whisper requires a filename with an extension
        formData.append('audio', blob, `recording.${mimeType === 'audio/webm' ? 'webm' : 'ogg'}`)

        console.log('[Voice] Sending to /api/transcribe')
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.text) {
            console.log('[Voice] Transcript received:', data.text)
            setInput(prev => prev ? prev + ' ' + data.text : data.text)
          } else {
            console.error('[Voice] Transcription error from API:', data.error)
          }
        } catch (err) {
          console.error('[Voice] Fetch error:', err)
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsListening(true)
      console.log('[Voice] Recording started, mimeType:', mimeType)
    } catch (err) {
      console.error('[Voice] Failed to start recording:', err)
      setIsListening(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-zinc-950">
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isLoading && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-zinc-900 bg-zinc-950 px-3 py-3 safe-bottom">
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
              onClick={toggleListening}
              disabled={isLoading}
              className={`w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-colors mb-0.5 ${
                isListening
                  ? 'bg-red-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              } disabled:opacity-30`}
              aria-label={isListening ? 'Stop recording' : 'Start voice input'}
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
      </div>

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
