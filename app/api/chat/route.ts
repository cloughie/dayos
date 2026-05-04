import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { Message } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

const CATEGORY_ORDER = ['pattern', 'decision', 'issue', 'person', 'preference']

async function loadMemoryContext(userId: string): Promise<string> {
  const supabase = await createClient()
  const { data: memories } = await supabase
    .from('user_memories')
    .select('category, content')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (!memories || memories.length === 0) return ''

  const sorted = [...memories].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category)
    const bi = CATEGORY_ORDER.indexOf(b.category)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  if (process.env.NODE_ENV === 'development') {
    console.log(`[Memory] Loaded ${memories.length} memories for injection`)
  }

  return 'Relevant user context from previous sessions:\n' +
    sorted.map(m => `• ${m.content}`).join('\n')
}

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured.' },
        { status: 500 }
      )
    }

    const { messages, clientTime, checkInPrompt }: { messages: Message[]; clientTime?: string; checkInPrompt?: string } = await request.json()

    let memoryContext = ''
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        memoryContext = await loadMemoryContext(user.id)
      }
    } catch (err) {
      console.error('[Memory] Failed to load memories:', err)
    }

    const history = messages.slice(-20).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    const datetimeContext = clientTime
      ? `The current local date and time is ${clientTime}. Use this as ground truth for any references to today, tomorrow, this morning, this afternoon, or this evening.`
      : ''

    const systemPrompt = [checkInPrompt, datetimeContext, memoryContext].filter(Boolean).join('\n\n')

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: history,
    })

    const message = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ message })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
