import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider, NextAuthProvider } from '@/lib/auth-context'

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
        <NextAuthProvider>
          <AuthProvider>{children}</AuthProvider>
        </NextAuthProvider>
      </body>
    </html>
  )
}
