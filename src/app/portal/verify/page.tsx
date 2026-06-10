'use client'
// src/app/portal/verify/page.tsx
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PortalVerifyPage() {
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const storedPhone = sessionStorage.getItem('portal_phone') ?? ''
    if (!storedPhone) {
      router.push('/portal')
      return
    }
    setPhone(storedPhone)
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/portal/auth?action=verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    })

    const data = await res.json() as { error?: string }

    if (!res.ok) {
      setError(data.error ?? 'Invalid code.')
      setLoading(false)
      return
    }

    sessionStorage.removeItem('portal_phone')
    router.push('/portal/home')
  }

  async function handleResend() {
    setResending(true)
    await fetch('/api/portal/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    setResending(false)
    setResent(true)
    setTimeout(() => setResent(false), 3000)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>Life. Covered.</div>
        <h1 style={styles.heading}>Check your texts</h1>
        <p style={styles.sub}>
          We sent a 6-digit code to {phone || 'your phone'}. Enter it below.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={styles.codeInput}
            maxLength={6}
            required
            autoFocus
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" style={styles.button} disabled={loading || code.length < 6}>
            {loading ? 'Verifying...' : 'Log in'}
          </button>
        </form>

        <div style={styles.footer}>
          <button onClick={handleResend} style={styles.resendBtn} disabled={resending}>
            {resent ? '✓ Code resent!' : resending ? 'Sending...' : 'Resend code'}
          </button>
          <span style={styles.divider}>·</span>
          <a href="/portal" style={styles.link}>Change number</a>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#FAF7F2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: "'DM Sans', -apple-system, sans-serif",
  },
  card: {
    background: '#FFFFFF',
    borderRadius: '16px',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
    textAlign: 'center',
  },
  logo: {
    fontFamily: 'Georgia, serif',
    fontSize: '22px',
    fontWeight: '700',
    color: '#1C1917',
    marginBottom: '24px',
  },
  heading: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1C1917',
    margin: '0 0 8px',
    fontFamily: 'Georgia, serif',
  },
  sub: {
    fontSize: '15px',
    color: '#78716C',
    margin: '0 0 32px',
    lineHeight: '1.5',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  codeInput: {
    width: '100%',
    padding: '18px',
    borderRadius: '10px',
    border: '1.5px solid #E7E3DC',
    fontSize: '32px',
    fontWeight: '700',
    color: '#1C1917',
    background: '#FAF7F2',
    outline: 'none',
    textAlign: 'center',
    letterSpacing: '8px',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    background: '#2d6a4f',
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: '600',
    border: 'none',
    cursor: 'pointer',
  },
  error: {
    color: '#DC2626',
    fontSize: '14px',
    margin: '0',
    textAlign: 'left',
  },
  footer: {
    marginTop: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#78716C',
  },
  resendBtn: {
    background: 'none',
    border: 'none',
    color: '#2d6a4f',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    padding: '0',
  },
  divider: {
    color: '#D6D3CE',
  },
  link: {
    color: '#2d6a4f',
    textDecoration: 'none',
    fontWeight: '500',
  },
}
