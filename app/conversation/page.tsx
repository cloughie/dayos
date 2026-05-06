import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConversationClient from '@/components/conversation/ConversationClient'

export default async function ConversationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const params = await searchParams

  // Dev/test bypass: force onboarding flow regardless of completion status
  if (params.onboarding === '1') {
    redirect('/onboarding?onboarding=1')
  }

  // Check onboarding completion — redirect new users to onboarding
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_complete')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_complete) {
    redirect('/onboarding')
  }

  const autoStart = params.autostart === '1'

  return <ConversationClient userEmail={user.email ?? ''} autoStart={autoStart} />
}
