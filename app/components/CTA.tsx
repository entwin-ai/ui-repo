import styles from './CTA.module.css'

export default function CTA() {
  return (
    <section className={styles.ctaSection} id="contact">
      <h2>Ready to Reclaim Your Time?</h2>
      <p>Join select high-net-worth professionals already using Entwin</p>
      <button className={styles.ctaButton}>Schedule Your Demo Today</button>
    </section>
  )
}
