import { Providers } from './providers'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Entwin - Your Personal AI Concierge',
  description: 'Reclaim your time with Entwin, your dedicated AI concierge service for high net worth individuals.',
  keywords: ['AI concierge', 'scheduling', 'email automation', 'task management'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
