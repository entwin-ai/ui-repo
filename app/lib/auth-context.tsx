'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

interface AuthUser {
  id: string
  email: string
  name: string
  firstName: string
  image?: string
  provider: 'google' | 'outlook'
}

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  signIn: (provider: 'google' | 'outlook') => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check if user is already logged in
  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/session')
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
      }
    } catch (error) {
      console.error('Error checking auth status:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const signIn = (provider: 'google' | 'outlook') => {
    // Redirect to the appropriate OAuth provider
    if (provider === 'google') {
      window.location.href = '/api/auth/google'
    } else if (provider === 'outlook') {
      window.location.href = '/api/auth/microsoft'
    }
  }

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      setUser(null)
      window.location.href = '/'
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
