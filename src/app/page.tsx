export default function Home() {
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column',
      fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '2rem',
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Life. Covered.</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Who&apos;s got the kids? You&apos;re covered.
      </p>
      <a href="/portal" style={{
        padding: '0.75rem 1.5rem', background: '#111', color: '#fff',
        borderRadius: '8px', textDecoration: 'none',
      }}>
        Go to your portal
      </a>
    </main>
  )
}
