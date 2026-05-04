'use client'

import React, { useState } from 'react'
import { signIn } from 'next-auth/react'
import styles from './AuthModal.module.css'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  if (!isOpen) return null

  const handleProviderSelect = async (provider: 'google' | 'outlook') => {
    alert(`Attempting to sign in with: ${provider}`)
    setIsLoading(true)
    // Map 'outlook' to 'azure-ad' for the NextAuth backend
    const providerId = provider === 'outlook' ? 'azure-ad' : provider
    signIn(providerId)
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>
          ✕
        </button>
        <h2 className={styles.title}>Sign In to Entwin</h2>
        <p className={styles.subtitle}>Choose your preferred authentication method</p>

        <div className={styles.buttonContainer}>
          <button
            className={`${styles.authButton} ${styles.google}`}
            onClick={() => handleProviderSelect('google')}
            disabled={isLoading}
          >
            <svg
              className={styles.icon}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>

          <button
            className={`${styles.authButton} ${styles.microsoft}`}
            onClick={() => handleProviderSelect('outlook')}
            disabled={isLoading}
          >
            <svg
              className={styles.icon}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M11.4 24H0V11.4h11.4V24zM24 24H12.6V11.4H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
            </svg>
            Sign in with Outlook
          </button>
        </div>

        <p className={styles.privacyNote}>
          We respect your privacy. Sign in is secure and encrypted.
        </p>
      </div>
    </div>
  )
}
