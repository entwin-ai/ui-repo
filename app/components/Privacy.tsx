import styles from './Privacy.module.css'

export default function Privacy() {
  return (
    <section className={styles.privacy}>
      <div className={styles.privacyContent}>
        <div className={styles.privacyText}>
          <h3>Privacy First</h3>
          <p>
            For high-net-worth individuals, privacy isn&apos;t optional—it&apos;l—it&apos;s essential. Entwin operates with bank-level security protocols.
          </p>
          <p>
            Your data never leaves your infrastructure. We support on-premise hosting and offer complete transparency into how your AI concierge operates.
          </p>
        </div>
        <div className={styles.privacyIcon}>🛡️</div>
      </div>
    </section>
  )
}
