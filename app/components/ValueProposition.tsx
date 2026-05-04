import styles from './ValueProposition.module.css'

export default function ValueProposition() {
  return (
    <section className={styles.valueProp} id="value">
      <div className={styles.valuePropContent}>
        <h2 className={styles.sectionTitle}>Why Choose Entwin</h2>
        <p className={styles.sectionSubtitle}>Designed specifically for high-net-worth professionals</p>
        
        <div className={styles.valueItems}>
          <div className={styles.valueItem}>
            <div className={styles.valueItemNumber}>⏰</div>
            <p><strong>Save Hours Weekly</strong><br />Automate routine tasks and reclaim 10+ hours of productive time every week.</p>
          </div>
          <div className={styles.valueItem}>
            <div className={styles.valueItemNumber}>🎯</div>
            <p><strong>Enhanced Focus</strong><br />Reduce distractions by filtering communications and prioritizing what matters.</p>
          </div>
          <div className={styles.valueItem}>
            <div className={styles.valueItemNumber}>📈</div>
            <p><strong>Better Decisions</strong><br />AI-powered insights and summaries help you make informed decisions faster.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
