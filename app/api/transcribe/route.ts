import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('audio') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    console.log('[Transcribe] Received audio:', file.type, file.size, 'bytes')

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    })

    console.log('[Transcribe] Result:', transcription.text)
    return NextResponse.json({ text: transcription.text })
  } catch (error) {
    console.error('[Transcribe] Error:', error)
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}
