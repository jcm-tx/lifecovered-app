/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/app/api/cron/trial-check/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Beta mode — use discounted price IDs until 50 subscribers
async function isBetaActive(): Promise<boolean> {
  const { count } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'parent')
    .eq('stripe_status', 'active')
  return (count ?? 0) < 50
}

// Determine the right plan tier based on actual village member count
async function getTierForFamily(familyId: string): Promise<{
  tier: 'solo' | 'family' | 'village'
  villageCount: number
}> {
  const { count } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('family_id', familyId)
    .eq('role', 'village')

  const villageCount = count ?? 0

  let tier: 'solo' | 'family' | 'village'
  if (villageCount === 0) tier = 'solo'
  else if (villageCount <= 3) tier = 'family'
  else tier = 'village'

  return { tier, villageCount }
}

// Human-readable plan name and price for messaging
function planLabel(tier: string, betaActive: boolean): { name: string; price: string } {
  const plans: Record<string, { name: string; betaPrice: string; fullPrice: string }> = {
    solo:    { name: 'Solo',    betaPrice: '$9/mo',  fullPrice: '$12/mo' },
    family:  { name: 'Family',  betaPrice: '$14/mo', fullPrice: '$19/mo' },
    village: { name: 'Village', betaPrice: '$19/mo', fullPrice: '$29/mo' },
  }
  const plan = plans[tier] ?? plans.solo!
  return { name: plan.name, price: betaActive ? plan.betaPrice : plan.fullPrice }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const now = new Date()
    const betaActive = await isBetaActive()

    const { data: trialUsers, error } = await supabase
      .from('users')
      .select('*, families(*)')
      .eq('stripe_status', 'trial')
      .not('trial_start', 'is', null)

    if (error) {
      console.error('Error fetching trial users:', error)
      return new NextResponse('Error fetching users', { status: 500 })
    }

    if (!trialUsers || trialUsers.length === 0) {
      return new NextResponse('No trial users', { status: 200 })
    }

    for (const user of trialUsers) {
      const trialStart = new Date(user.trial_start as string)
      const daysSinceStart = Math.floor(
        (now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24)
      )

      const { tier, villageCount } = await getTierForFamily(user.family_id as string)
      const { name: planName, price: planPrice } = planLabel(tier, betaActive)
      const eventCount = await getEventCount(user.family_id as string)

      // Update family tier to match actual usage before creating payment link
      await supabase
        .from('families')
        .update({ tier })
        .eq('id', user.family_id)

      const paymentLink = await createStripePaymentLink(user, tier, betaActive)

      // Build a village context line for messaging
      const villageContext = villageCount > 0
        ? ` You have ${villageCount} village member${villageCount !== 1 ? 's' : ''} set up, so you're on the ${planName} plan (${planPrice}).`
        : ''

      const betaLockMsg = betaActive
        ? ` Lock in ${planPrice} for life — this beta rate never goes up.`
        : ''

      // Day 6 — first payment reminder
      if (daysSinceStart === 6) {
        await sendSMS(
          user.phone_number as string,
          `Hey ${user.name}! Your Life. Covered. trial ends tomorrow. You've got ${eventCount} events tracked and your family all set up.${villageContext}${betaLockMsg} Tap here to continue: ${paymentLink}`
        )
      }

      // Day 7 — final reminder
      if (daysSinceStart === 7) {
        await sendSMS(
          user.phone_number as string,
          `Last day of your trial, ${user.name}! Your ${planName} plan is ${planPrice}.${villageContext} Subscribe here before your data goes on hold: ${paymentLink}`
        )
      }

      // Day 8 — suspend service
      if (daysSinceStart >= 8) {
        await supabase
          .from('users')
          .update({ stripe_status: 'expired' })
          .eq('id', user.id)

        await sendSMS(
          user.phone_number as string,
          `Hey ${user.name} — your Life. Covered. trial has ended. Your family's data is safe and waiting. To pick up where you left off, subscribe to the ${planName} plan (${planPrice}) here: ${paymentLink}`
        )
      }
    }

    return new NextResponse(`Processed ${trialUsers.length} trial users`, { status: 200 })

  } catch (err) {
    console.error('Trial check cron error:', err)
    return new NextResponse('Cron job failed', { status: 500 })
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createStripePaymentLink(
  user: {
    name: string
    phone_number: string
    stripe_customer_id: string | null
    family_id: string
  },
  tier: 'solo' | 'family' | 'village',
  betaActive: boolean
): Promise<string> {
  try {
    const priceMap: Record<string, string> = betaActive
      ? {
          solo:    process.env.STRIPE_PRICE_BETA_SOLO    ?? process.env.STRIPE_PRICE_SOLO!,
          family:  process.env.STRIPE_PRICE_BETA_FAMILY  ?? process.env.STRIPE_PRICE_FAMILY!,
          village: process.env.STRIPE_PRICE_BETA_VILLAGE ?? process.env.STRIPE_PRICE_VILLAGE!,
        }
      : {
          solo:    process.env.STRIPE_PRICE_SOLO!,
          family:  process.env.STRIPE_PRICE_FAMILY!,
          village: process.env.STRIPE_PRICE_VILLAGE!,
        }

    const priceId = priceMap[tier] ?? priceMap.solo!

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        user_phone: user.phone_number,
        family_id: user.family_id,
      },
    })

    return paymentLink.url
  } catch (err) {
    console.error('Error creating Stripe payment link:', err)
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lifecovered.app'
  }
}

async function getEventCount(familyId: string): Promise<number> {
  const { count } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('family_id', familyId)
  return count ?? 0
}

async function sendSMS(to: string, message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !from) {
    console.error('Twilio credentials missing')
    return
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }),
    }
  )

  if (!response.ok) {
    console.error('Twilio SMS failed:', await response.text())
  }
}
