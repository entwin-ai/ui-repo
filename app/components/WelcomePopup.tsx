'use client'

import styles from './WelcomePopup.module.css'

interface WelcomePopupProps {
  isOpen: boolean
  onClose: () => void
  userName: string
}

export default function WelcomePopup({ isOpen, onClose, userName }: WelcomePopupProps) {
  if (!isOpen) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Welcome!</h2>
        <p className={styles.message}>You have successfully signed in as</p>
        <p className={styles.userName}>{userName}</p>
        <button className={styles.closeButton} onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  )
}
