import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConversationClient from '@/components/conversation/ConversationClient'

export default async function ConversationPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return <ConversationClient userEmail={user.email ?? ''} />
}
