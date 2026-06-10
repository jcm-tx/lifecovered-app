// src/app/api/portal/events/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPortalSession } from '~/lib/portal-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — fetch upcoming events
export async function GET(): Promise<NextResponse> {
  const session = await getPortalSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  const { data: events } = await supabase
    .from('events')
    .select('id, title, event_date, event_time, confirmed, children(name, type), assigned_user:assigned_to(name)')
    .eq('family_id', session.familyId)
    .gte('event_date', today)
    .lte('event_date', in60Days)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true })

  return NextResponse.json({ events: events ?? [] })
}

// DELETE — cancel an event
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await getPortalSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id: string }

  await supabase
    .from('events')
    .delete()
    .eq('id', id)
    .eq('family_id', session.familyId)

  return NextResponse.json({ success: true })
}
