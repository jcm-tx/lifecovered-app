import '~/styles/globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Life. Covered.',
  description: 'AI-powered family logistics. Who\u2019s got the kids? You\u2019re covered.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
