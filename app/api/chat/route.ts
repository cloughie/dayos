import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { Message } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/encryption'
import { buildHistory } from '@/lib/chat-history'

// Attachment carried from the client for a single conversation turn.
// Only the binary (base64 + mimeType) and the message ID arrive here —
// filenames are kept client-side and never transmitted.
type AttachmentPayload = {
  messageId: string
  base64: string
  mimeType: string
}

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
    const {
      messages,
      attachments,
      source,
    }: { messages: Message[]; attachments?: AttachmentPayload[]; source?: string } = await request.json()

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

    const history = buildHistory(messages, attachments)

    const nameContext = preferredName ? `User preferred name: ${preferredName}` : ''
    const systemPrompt = [nameContext, memoryContext].filter(Boolean).join('\n\n')

    if (process.env.NODE_ENV === 'development') {
      console.log('[Chat] Messages sent to Claude:')
      if (systemPrompt) console.log('[Chat] system:', systemPrompt)
      history.forEach((m, i) => {
        // Never log base64 content — summarise multimodal blocks instead
        const summary = Array.isArray(m.content)
          ? m.content.map(b => {
              if (b.type === 'image') return '[image]'
              if (b.type === 'document') return '[document]'
              if ('text' in b) return (b.text as string).slice(0, 120)
              return '[block]'
            }).join(' ')
          : m.content
        console.log(`[Chat] [${i}] ${m.role}:`, summary)
      })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Anthropic API key not configured.' }, { status: 500 })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      // chat-history.ts uses a generic block type to stay SDK-free for testing;
      // cast here where the SDK types are in scope.
      messages: history as Anthropic.Messages.MessageParam[],
    })

    const message = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ message })
  } catch (error) {
    // Log only the message — never the full error object which may reference request body
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Chat] Error:', message)
    return NextResponse.json({ error: 'Internal server error', detail: message }, { status: 500 })
  }
}
