// src/app/api/portal/family/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPortalSession } from '~/lib/portal-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — fetch family data (kids + village members + user name + emails)
export async function GET(): Promise<NextResponse> {
  const session = await getPortalSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: children }, { data: village }, { data: userRaw }, { data: emails }] = await Promise.all([
    supabase
      .from('children')
      .select('id, name, age, school, type')
      .eq('family_id', session.familyId)
      .order('type')
      .order('name'),
    supabase
      .from('users')
      .select('id, name, phone_number, role')
      .eq('family_id', session.familyId)
      .neq('id', session.userId)
      .order('name'),
    supabase
      .from('users')
      .select('name')
      .eq('id', session.userId)
      .single(),
    supabase
      .from('user_emails')
      .select('id, email, created_at')
      .eq('user_id', session.userId)
      .order('created_at', { ascending: true }),
  ])

  const user = userRaw as { name: string } | null

  return NextResponse.json({
    children: children ?? [],
    village: village ?? [],
    userName: user?.name ?? '',
    emails: emails ?? [],
  })
}

// POST — add or update a child, village member, or email
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getPortalSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    type: 'child' | 'village' | 'email'
    id?: string
    name?: string
    age?: number | null
    school?: string | null
    childType?: 'child' | 'elderly'
    phone?: string
    role?: string
    email?: string
  }

  if (body.type === 'child') {
    if (body.id) {
      await supabase
        .from('children')
        .update({ name: body.name, age: body.age ?? null, school: body.school ?? null })
        .eq('id', body.id)
        .eq('family_id', session.familyId)
    } else {
      await supabase.from('children').insert({
        family_id: session.familyId,
        name: body.name,
        age: body.age ?? null,
        school: body.school ?? null,
        type: body.childType ?? 'child',
      })
    }
  }

  if (body.type === 'village') {
    if (body.id) {
      await supabase
        .from('users')
        .update({ name: body.name })
        .eq('id', body.id)
        .eq('family_id', session.familyId)
    } else if (body.phone) {
      const rawPhone = body.phone.replace(/[^\d]/g, '')
      const phone = rawPhone.length === 10 ? `+1${rawPhone}` : `+${rawPhone}`
      await supabase.from('users').insert({
        phone_number: phone,
        name: body.name,
        family_id: session.familyId,
        role: body.role ?? 'village',
        stripe_status: 'village',
      })
    }
  }

  if (body.type === 'email' && body.email) {
    const normalizedEmail = body.email.toLowerCase().trim()

    // Check for duplicate
    const { data: existing } = await supabase
      .from('user_emails')
      .select('id')
      .eq('user_id', session.userId)
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    await supabase.from('user_emails').insert({
      user_id: session.userId,
      family_id: session.familyId,
      email: normalizedEmail,
    })

    // Keep users.email in sync with first registered email if not already set
    const { data: userRaw } = await supabase
      .from('users')
      .select('email')
      .eq('id', session.userId)
      .single()
    const existingUser = userRaw as { email: string | null } | null
    if (!existingUser?.email) {
      await supabase
        .from('users')
        .update({ email: normalizedEmail })
        .eq('id', session.userId)
    }
  }

  return NextResponse.json({ success: true })
}

// DELETE — remove a child, village member, or email
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await getPortalSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, type } = await req.json() as { id: string; type: 'child' | 'village' | 'email' }

  if (type === 'child') {
    await supabase
      .from('children')
      .delete()
      .eq('id', id)
      .eq('family_id', session.familyId)
  }

  if (type === 'village') {
    await supabase
      .from('users')
      .delete()
      .eq('id', id)
      .eq('family_id', session.familyId)
      .neq('id', session.userId)
  }

  if (type === 'email') {
    await supabase
      .from('user_emails')
      .delete()
      .eq('id', id)
      .eq('user_id', session.userId)
  }

  return NextResponse.json({ success: true })
}
