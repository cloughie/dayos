'use client'

import { useState, useEffect } from 'react'

interface Memory {
  id: string
  category: string
  content: string
  updated_at: string
}

interface MemoryPanelProps {
  isOpen: boolean
  onClose: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  pattern: 'Pattern',
  decision: 'Decision',
  issue: 'Issue',
  person: 'Person',
  preference: 'Preference',
}

export default function MemoryPanel({ isOpen, onClose }: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch('/api/memories')
      .then(r => r.json())
      .then(d => setMemories(d.memories ?? []))
      .catch(() => setMemories([]))
      .finally(() => setLoading(false))
  }, [isOpen])

  async function handleDelete(id: string) {
    await fetch(`/api/memories/${id}`, { method: 'DELETE' })
    setMemories(prev => prev.filter(m => m.id !== id))
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-2xl border-t border-zinc-800 p-6 safe-bottom max-h-[70vh] flex flex-col">
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-6 shrink-0" />

        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-base font-semibold text-white">Memory</h2>
          <span className="text-xs text-zinc-500">{memories.length} saved</span>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <p className="text-sm text-zinc-500 text-center py-8">Loading…</p>
          ) : memories.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">No memories yet.</p>
          ) : (
            <ul className="space-y-2">
              {memories.map(m => (
                <li
                  key={m.id}
                  className="flex items-start gap-3 bg-zinc-800/50 rounded-xl px-4 py-3"
                >
                  <span className="text-xs text-zinc-500 mt-0.5 shrink-0 w-16">
                    {CATEGORY_LABELS[m.category] ?? m.category}
                  </span>
                  <p className="text-sm text-zinc-200 flex-1 leading-snug">{m.content}</p>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                    aria-label="Delete memory"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 text-zinc-500 text-sm py-2 hover:text-zinc-300 transition-colors shrink-0"
        >
          Close
        </button>
      </div>
    </>
  )
}
