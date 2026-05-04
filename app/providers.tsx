'use client'

import { AuthProvider, NextAuthProvider } from '@/lib/auth-context'
import { PropsWithChildren } from 'react'

export function Providers({ children }: PropsWithChildren) {
  return (
    <NextAuthProvider>
      <AuthProvider>{children}</AuthProvider>
    </NextAuthProvider>
  )
}
