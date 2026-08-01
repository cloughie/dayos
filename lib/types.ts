export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  hidden?: boolean
  // Display-only metadata for attached files (up to 4). Contains no binary —
  // filenames are stored locally for badges and are never transmitted to the server.
  attachmentPreviews?: Array<{ type: 'image' | 'pdf'; name: string }>
}

export type ConversationMode = 'checkin' | 'refine'

export type Plan = {
  id: string
  user_id: string
  date: string
  raw_text: string
  mindset_cue?: string
  top_wins?: string
  morning?: string
  midday?: string
  afternoon_evening?: string
  optional?: string
  guardrails?: string
  created_at: string
  updated_at: string
}

export type Conversation = {
  id: string
  user_id: string
  date: string
  messages: Message[]
  mode: ConversationMode
  created_at: string
  updated_at: string
}

export type UserProfile = {
  id: string
  email: string
  preferred_name: string
  onboarding_notes?: string
  onboarding_complete: boolean
  push_notifications_enabled: boolean
  push_notifications_permission_status: 'granted' | 'denied' | 'default'
  ai_data_sharing_consent: boolean | null
  created_at: string
}
