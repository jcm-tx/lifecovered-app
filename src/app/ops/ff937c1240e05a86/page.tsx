'use client'
// src/app/ops/ff937c1240e05a86/page.tsx
// SECRET ADMIN DASHBOARD — DO NOT SHARE THIS URL
// URL: /ops/ff937c1240e05a86

import { useState, useEffect } from 'react'

interface Stats {
  totalFamilies: number
  trialUsers: number
  activeSubscribers: number
  expiredUsers: number
  totalEvents: number
  totalMessages: number
  eventsToday: number
  messagesLast24h: number
  newSignupsToday: number
  newSignupsThisWeek: number
}

interface RecentMessage {
  id: string
  direction: string
  channel: string
  content: string
  created_at: string
  users: { name: string; phone_number: string } | null
}

interface RecentSignup {
  id: string
  name: string
  phone_number: string
  stripe_status: string
  created_at: string
  families: { name: string; tier: string } | null
}

interface StuckUser {
  phone_number: string
  step: string
  created_at: string
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [messages, setMessages] = useState<RecentMessage[]>([])
  const [signups, setSignups] = useState<RecentSignup[]>([])
  const [stuck, setStuck] = useState<StuckUser[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [activeTab, setActiveTab] = useState<'overview' | 'messages' | 'users' | 'flags'>('overview')

  useEffect(() => {
    void loadData()
    const interval = setInterval(() => void loadData(), 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    const res = await fetch('/api/admin/dashboard')
    if (!res.ok) return
    const data = await res.json() as {
      stats: Stats
      recentMessages: RecentMessage[]
      recentSignups: RecentSignup[]
      stuckUsers: StuckUser[]
    }
    setStats(data.stats)
    setMessages(data.recentMessages ?? [])
    setSignups(data.recentSignups ?? [])
    setStuck(data.stuckUsers ?? [])
    setLastRefresh(new Date())
    setLoading(false)
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loading}>Loading dashboard...</div>
      </div>
    )
  }

  const conversionRate = stats && (stats.trialUsers + stats.activeSubscribers) > 0
    ? Math.round((stats.activeSubscribers / (stats.trialUsers + stats.activeSubscribers + stats.expiredUsers)) * 100)
    : 0

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerLogo}>Life. Covered. — Ops</div>
          <div style={styles.headerSub}>Last updated {lastRefresh.toLocaleTimeString()} · Auto-refreshes every 30s</div>
        </div>
        <button onClick={() => void loadData()} style={styles.refreshBtn}>↻ Refresh</button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['overview', 'messages', 'users', 'flags'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={activeTab === tab ? styles.tabActive : styles.tab}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'flags' && stuck.length > 0 && (
              <span style={styles.badge}>{stuck.length}</span>
            )}
          </button>
        ))}
      </div>

      <div style={styles.content}>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && stats && (
          <>
            {/* Key metrics */}
            <div style={styles.metricsGrid}>
              <div style={styles.metricCard}>
                <div style={styles.metricNumber}>{stats.activeSubscribers}</div>
                <div style={styles.metricLabel}>Paying subscribers</div>
                <div style={styles.metricSub}>Goal: 70</div>
                <div style={styles.progressBar}>
                  <div style={{...styles.progressFill, width: `${Math.min((stats.activeSubscribers / 70) * 100, 100)}%`}} />
                </div>
              </div>
              <div style={styles.metricCard}>
                <div style={styles.metricNumber}>{stats.trialUsers}</div>
                <div style={styles.metricLabel}>Active trials</div>
                <div style={styles.metricSub}>Conversion potential</div>
              </div>
              <div style={styles.metricCard}>
                <div style={styles.metricNumber}>{conversionRate}%</div>
                <div style={styles.metricLabel}>Trial → paid</div>
                <div style={styles.metricSub}>Target: 30%+</div>
              </div>
              <div style={styles.metricCard}>
                <div style={styles.metricNumber}>{stats.newSignupsToday}</div>
                <div style={styles.metricLabel}>New today</div>
                <div style={styles.metricSub}>{stats.newSignupsThisWeek} this week</div>
              </div>
            </div>

            {/* Activity */}
            <div style={styles.metricsGrid}>
              <div style={styles.metricCard}>
                <div style={styles.metricNumber}>{stats.messagesLast24h}</div>
                <div style={styles.metricLabel}>Messages (24h)</div>
              </div>
              <div style={styles.metricCard}>
                <div style={styles.metricNumber}>{stats.eventsToday}</div>
                <div style={styles.metricLabel}>Events saved today</div>
              </div>
              <div style={styles.metricCard}>
                <div style={styles.metricNumber}>{stats.totalFamilies}</div>
                <div style={styles.metricLabel}>Total families</div>
              </div>
              <div style={styles.metricCard}>
                <div style={styles.metricNumber}>{stats.expiredUsers}</div>
                <div style={styles.metricLabel}>Expired trials</div>
              </div>
            </div>

            {/* Beta progress */}
            <div style={styles.betaCard}>
              <div style={styles.betaTitle}>Beta pricing progress</div>
              <div style={styles.betaBar}>
                <div style={{...styles.betaFill, width: `${Math.min((stats.activeSubscribers / 50) * 100, 100)}%`}} />
              </div>
              <div style={styles.betaSub}>{stats.activeSubscribers} / 50 beta spots filled · {50 - stats.activeSubscribers} remaining</div>
            </div>
          </>
        )}

        {/* MESSAGES TAB */}
        {activeTab === 'messages' && (
          <div>
            <h2 style={styles.sectionTitle}>Recent messages (last 50)</h2>
            {messages.length === 0 ? (
              <div style={styles.empty}>No messages yet.</div>
            ) : (
              <div style={styles.messageList}>
                {messages.map(msg => (
                  <div key={msg.id} style={styles.messageRow}>
                    <div style={{
                      ...styles.directionBadge,
                      background: msg.direction === 'inbound' ? '#DCFCE7' : '#EFF6FF',
                      color: msg.direction === 'inbound' ? '#166534' : '#1D4ED8',
                    }}>
                      {msg.direction === 'inbound' ? '↓ IN' : '↑ OUT'}
                    </div>
                    <div style={styles.messageInfo}>
                      <div style={styles.messageName}>
                        {msg.users?.name ?? 'Unknown'} · {msg.channel}
                      </div>
                      <div style={styles.messageContent}>{msg.content.slice(0, 120)}{msg.content.length > 120 ? '...' : ''}</div>
                    </div>
                    <div style={styles.messageTime}>{timeAgo(msg.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div>
            <h2 style={styles.sectionTitle}>Recent signups</h2>
            {signups.length === 0 ? (
              <div style={styles.empty}>No signups yet.</div>
            ) : (
              <div>
                {signups.map(user => (
                  <div key={user.id} style={styles.userRow}>
                    <div style={styles.userInfo}>
                      <div style={styles.userName}>{user.name}</div>
                      <div style={styles.userMeta}>{user.phone_number} · {user.families?.name ?? 'Unknown family'} · {user.families?.tier ?? 'solo'}</div>
                    </div>
                    <div style={styles.userRight}>
                      <div style={{
                        ...styles.statusBadge,
                        background: user.stripe_status === 'active' ? '#DCFCE7' :
                          user.stripe_status === 'trial' ? '#FEF9C3' :
                          user.stripe_status === 'expired' ? '#FEE2E2' : '#F3F4F6',
                        color: user.stripe_status === 'active' ? '#166534' :
                          user.stripe_status === 'trial' ? '#854D0E' :
                          user.stripe_status === 'expired' ? '#991B1B' : '#374151',
                      }}>
                        {user.stripe_status}
                      </div>
                      <div style={styles.userTime}>{timeAgo(user.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FLAGS TAB */}
        {activeTab === 'flags' && (
          <div>
            <h2 style={styles.sectionTitle}>
              Users stuck in onboarding
              {stuck.length > 0 && <span style={styles.flagCount}> — {stuck.length} flagged</span>}
            </h2>
            {stuck.length === 0 ? (
              <div style={styles.empty}>✓ No users stuck in onboarding. All clear.</div>
            ) : (
              stuck.map(user => (
                <div key={user.phone_number} style={styles.flagRow}>
                  <div style={styles.flagIcon}>⚠️</div>
                  <div style={styles.flagInfo}>
                    <div style={styles.flagPhone}>{user.phone_number}</div>
                    <div style={styles.flagStep}>Stuck at: {user.step}</div>
                  </div>
                  <div style={styles.flagTime}>{timeAgo(user.created_at)}</div>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0F172A', fontFamily: "'DM Sans', -apple-system, sans-serif", color: '#E2E8F0' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#94A3B8' },
  header: { padding: '24px 32px', borderBottom: '1px solid #1E293B', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerLogo: { fontFamily: 'Georgia, serif', fontSize: '20px', fontWeight: '700', color: '#F1F5F9', marginBottom: '4px' },
  headerSub: { fontSize: '13px', color: '#64748B' },
  refreshBtn: { background: '#1E293B', border: '1px solid #334155', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', color: '#94A3B8', cursor: 'pointer' },
  tabs: { padding: '0 32px', borderBottom: '1px solid #1E293B', display: 'flex', gap: '0' },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', padding: '16px 20px', fontSize: '14px', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
  tabActive: { background: 'none', border: 'none', borderBottom: '2px solid #2d6a4f', padding: '16px 20px', fontSize: '14px', color: '#F1F5F9', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
  badge: { background: '#DC2626', color: '#FFF', borderRadius: '10px', padding: '2px 7px', fontSize: '11px', fontWeight: '700' },
  content: { padding: '32px' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' },
  metricCard: { background: '#1E293B', borderRadius: '12px', padding: '20px', border: '1px solid #334155' },
  metricNumber: { fontSize: '36px', fontWeight: '700', color: '#2d6a4f', fontFamily: 'Georgia, serif', marginBottom: '4px' },
  metricLabel: { fontSize: '14px', color: '#94A3B8', fontWeight: '500' },
  metricSub: { fontSize: '12px', color: '#475569', marginTop: '4px' },
  progressBar: { height: '4px', background: '#334155', borderRadius: '2px', marginTop: '12px' },
  progressFill: { height: '100%', background: '#2d6a4f', borderRadius: '2px' },
  betaCard: { background: '#1E293B', borderRadius: '12px', padding: '24px', border: '1px solid #334155', marginTop: '16px' },
  betaTitle: { fontSize: '15px', fontWeight: '600', color: '#F1F5F9', marginBottom: '12px' },
  betaBar: { height: '8px', background: '#334155', borderRadius: '4px', marginBottom: '8px' },
  betaFill: { height: '100%', background: '#D97706', borderRadius: '4px', transition: 'width 0.3s' },
  betaSub: { fontSize: '13px', color: '#64748B' },
  sectionTitle: { fontSize: '16px', fontWeight: '600', color: '#F1F5F9', margin: '0 0 16px' },
  flagCount: { color: '#FCA5A5', fontWeight: '400' },
  empty: { background: '#1E293B', borderRadius: '12px', padding: '24px', color: '#64748B', fontSize: '15px', textAlign: 'center' },
  messageList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  messageRow: { background: '#1E293B', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px', border: '1px solid #334155' },
  directionBadge: { borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap', marginTop: '2px' },
  messageInfo: { flex: 1 },
  messageName: { fontSize: '13px', fontWeight: '500', color: '#94A3B8', marginBottom: '4px' },
  messageContent: { fontSize: '14px', color: '#E2E8F0' },
  messageTime: { fontSize: '12px', color: '#475569', whiteSpace: 'nowrap' },
  userRow: { background: '#1E293B', borderRadius: '10px', padding: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #334155' },
  userInfo: { flex: 1 },
  userName: { fontSize: '15px', fontWeight: '500', color: '#F1F5F9' },
  userMeta: { fontSize: '13px', color: '#64748B', marginTop: '2px' },
  userRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' },
  statusBadge: { borderRadius: '20px', padding: '4px 10px', fontSize: '12px', fontWeight: '600' },
  userTime: { fontSize: '12px', color: '#475569' },
  flagRow: { background: '#1E293B', borderRadius: '10px', padding: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #7F1D1D' },
  flagIcon: { fontSize: '20px' },
  flagInfo: { flex: 1 },
  flagPhone: { fontSize: '15px', fontWeight: '500', color: '#F1F5F9' },
  flagStep: { fontSize: '13px', color: '#FCA5A5', marginTop: '2px' },
  flagTime: { fontSize: '12px', color: '#64748B' },
}
