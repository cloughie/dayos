import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const VALID_CATEGORIES = new Set(['pattern', 'issue', 'decision', 'person', 'preference'])

const EXTRACTION_PROMPT = `Review this conversation and decide if anything should be remembered for future check-ins.

Only save durable context that will improve future thinking or reduce repetition.

Only save a memory if it adds materially new information not already covered by existing memories.

Prioritise:

* recurring patterns in behaviour or thinking
* ongoing issues or situations
* key decisions that affect direction
* important people and their role/context
* stable preferences in how the user likes to think or plan

Do NOT save:

* temporary moods or daily fluctuations
* one-off events
* minor details with no reuse value
* speculative or uncertain conclusions

Important:

* Do not infer recurring patterns from a single example unless the user explicitly says it is recurring.
* Store single-session observations as issue or decision only if they are clearly ongoing, time-bound, or likely to affect future check-ins.
* Prioritise active multi-week commitments, goals, or constraints, such as training blocks, nutrition cuts, job search phases, financial runway, major projects, or caregiving responsibilities.
* For people, store only clearly stated facts. Do not infer living arrangements, relationship dynamics, or preferences from context.
* When uncertain, save the simpler, more factual version.

Keep memories short and clear.

Return JSON only:

{
  "memories": [
    {
      "category": "pattern | issue | decision | person | preference",
      "content": "short memory statement"
    }
  ]
}

Max 3 memories.
If nothing is worth saving, return:
{ "memories": [] }`

function isSimilar(a: string, b: string): boolean {
  const al = a.toLowerCase().trim()
  const bl = b.toLowerCase().trim()
  return al === bl || al.includes(bl) || bl.includes(al)
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: memories, error } = await supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ memories: memories ?? [] })
  } catch (error) {
    console.error('[Memory] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { messages } = await request.json()
    if (!messages || messages.length < 2) {
      return NextResponse.json({ saved: 0, skipped: 0 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ saved: 0, skipped: 0 })
    }

    const conversationText = messages
      .slice(-10)
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join('\n\n')

    // Fetch existing memories to inject into the prompt (semantic dedup) and for string-based safety net
    const { data: existing } = await supabase
      .from('user_memories')
      .select('id, content')
      .eq('user_id', user.id)

    const existingContext = existing?.length
      ? `\n\nAlready stored memories. Do not duplicate these:\n${existing.map(m => `- ${m.content}`).join('\n')}`
      : ''

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Memory] Passing ${existing?.length ?? 0} existing memories into extraction prompt`)
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `${EXTRACTION_PROMPT}${existingContext}\n\nConversation:\n${conversationText}`,
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Memory] No JSON in extraction response')
      }
      return NextResponse.json({ saved: 0, skipped: 0 })
    }

    const raw: Array<{ category: string; content: string }> =
      JSON.parse(jsonMatch[0]).memories ?? []

    const extracted = raw
      .slice(0, 3)
      .map(mem => ({
        ...mem,
        category: VALID_CATEGORIES.has(mem.category) ? mem.category : 'issue',
      }))

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Memory] Extracted: ${extracted.length}`)
    }

    if (extracted.length === 0) {
      return NextResponse.json({ saved: 0, skipped: 0 })
    }

    let saved = 0
    let skipped = 0

    for (const mem of extracted) {
      const duplicate = existing?.find(e => isSimilar(e.content, mem.content))

      if (duplicate) {
        if (duplicate.content.toLowerCase().trim() !== mem.content.toLowerCase().trim()) {
          await supabase
            .from('user_memories')
            .update({ content: mem.content, updated_at: new Date().toISOString() })
            .eq('id', duplicate.id)
          saved++
        } else {
          skipped++
        }
      } else {
        await supabase.from('user_memories').insert({
          user_id: user.id,
          category: mem.category,
          content: mem.content,
        })
        saved++
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Memory] Saved: ${saved}, Skipped (duplicates): ${skipped}`)
    }

    return NextResponse.json({ saved, skipped })
  } catch (error) {
    console.error('[Memory] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
