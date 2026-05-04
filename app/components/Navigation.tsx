'use client'

import Link from 'next/link'
import styles from './Navigation.module.css'

export default function Navigation() {
  return (
    <nav className={styles.nav}>
      <div className={styles.logo}>entwin</div>
      <ul className={styles.navLinks}>
        <li><a href="#features">Features</a></li>
        <li><a href="#value">Why Entwin</a></li>
        <li><a href="#pricing">Pricing</a></li>
        <li><a href="#contact" className={styles.ctaButton}>Get Started</a></li>
      </ul>
    </nav>
  )
}
