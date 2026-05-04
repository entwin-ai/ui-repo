'use client'

import { Session } from 'next-auth'
import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react'
import {
  createContext,
  useContext,
  PropsWithChildren,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import AuthModal from '@/app/components/AuthModal'
import WelcomePopup from '@/app/components/WelcomePopup'

interface AuthContextType {
  session: Session | null
  status: 'authenticated' | 'loading' | 'unauthenticated'
  signIn: (provider: 'google' | 'outlook') => void
  signOut: () => void
  showAuthModal: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const { data: session, status } = useSession()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isWelcomePopupOpen, setIsWelcomePopupOpen] = useState(false)
  const prevStatus = useRef(status)

  useEffect(() => {
    if (
      prevStatus.current !== 'authenticated' &&
      status === 'authenticated' &&
      session?.user?.name
    ) {
      setIsWelcomePopupOpen(true)
    }
    prevStatus.current = status
  }, [status, session])

  const handleSignIn = useCallback((provider: 'google' | 'outlook') => {
    if (provider === 'outlook') {
      signIn('azure-ad')
    } else {
      signIn(provider)
    }
  }, [])

  const handleSignOut = useCallback(() => {
    signOut()
  }, [])

  const showAuthModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  const closeWelcomePopup = useCallback(() => {
    setIsWelcomePopupOpen(false)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        status,
        signIn: handleSignIn,
        signOut: handleSignOut,
        showAuthModal,
      }}
    >
      {children}
      <AuthModal isOpen={isModalOpen} onClose={closeModal} />
      <WelcomePopup
        isOpen={isWelcomePopupOpen}
        onClose={closeWelcomePopup}
        userName={session?.user?.name || ''}
      />
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

export function NextAuthProvider({ children }: PropsWithChildren) {
  return <SessionProvider>{children}</SessionProvider>
}
