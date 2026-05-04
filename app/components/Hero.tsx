import styles from './Hero.module.css'

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroGraphic}>🤖</div>
      <h1>Your Personal AI Concierge</h1>
      <p className={styles.heroSubtitle}>
        Reclaim your time. Entwin is your dedicated AI concierge service, handling scheduling, 
        email drafting, and task prioritization—so you focus on what matters most.
      </p>
      <div className={styles.heroCta}>
        <button className={styles.ctaButton}>Start Free Trial</button>
        <button className={`${styles.ctaButton} ${styles.secondaryButton}`}>Schedule Demo</button>
      </div>
    </section>
  )
}
