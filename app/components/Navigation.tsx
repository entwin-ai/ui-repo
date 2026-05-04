'use client'

import { useAuth } from '@/lib/auth-context'
import styles from './Navigation.module.css'

export default function Navigation() {
  const { session, status, showAuthModal } = useAuth()
  const userName = session?.user?.name?.split(' ')[0]

  return (
    <nav className={styles.nav}>
      <div className={styles.logo}>entwin</div>
      {status === 'authenticated' && userName && (
        <div className={styles.welcomeMessage}>Hi, {userName}</div>
      )}
      <ul className={styles.navLinks}>
        <li>
          <a href="#features">Features</a>
        </li>
        <li>
          <a href="#value">Why Entwin</a>
        </li>
        <li>
          <a href="#pricing">Pricing</a>
        </li>
        {status !== 'authenticated' && (
          <li>
            <button onClick={showAuthModal} className={styles.ctaButton}>
              Sign Up / Sign In
            </button>
          </li>
        )}
      </ul>
    </nav>
  )
}
