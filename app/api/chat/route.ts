import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { Message } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/encryption'

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
    sorted.map(m => `• ${decrypt(m.content)}`).join('\n')
}

export async function POST(request: Request) {
  try {
    const { messages, source }: { messages: Message[]; source?: string } = await request.json()

    // Consent guard — authoritative check before any Anthropic call
    {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const { data: cp } = await supabase
        .from('user_profiles')
        .select('ai_data_sharing_consent')
        .eq('id', user.id)
        .single()
      if (!cp?.ai_data_sharing_consent) {
        return NextResponse.json({ error: 'AI data sharing consent not granted.' }, { status: 403 })
      }
    }

    let memoryContext = ''
    let preferredName = ''
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const [memory, profile] = await Promise.all([
          loadMemoryContext(user.id),
          supabase.from('user_profiles').select('preferred_name').eq('id', user.id).single(),
        ])
        memoryContext = memory
        preferredName = profile.data?.preferred_name ?? ''
      }
    } catch (err) {
      console.error('[Memory] Failed to load memories:', err)
    }

    const history = messages.slice(-20).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    const nameContext = preferredName ? `User preferred name: ${preferredName}` : ''
    const systemPrompt = [nameContext, memoryContext].filter(Boolean).join('\n\n')

    if (process.env.NODE_ENV === 'development') {
      console.log('[Chat] Messages sent to Claude:')
      if (systemPrompt) console.log('[Chat] system:', systemPrompt)
      history.forEach((m, i) => console.log(`[Chat] [${i}] ${m.role}:`, m.content))
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Anthropic API key not configured.' }, { status: 500 })
    }

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
    const message = error instanceof Error ? error.message : String(error)
    console.error('Chat API error:', message, error)
    return NextResponse.json({ error: 'Internal server error', detail: message }, { status: 500 })
  }
}
