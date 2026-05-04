import styles from './Pricing.module.css'

export default function Pricing() {
  return (
    <section className={styles.pricing} id="pricing">
      <h2 className={styles.sectionTitle}>Simple, Transparent Pricing</h2>
      <p className={styles.sectionSubtitle}>One plan, unlimited possibilities</p>
      
      <div className={styles.pricingCard}>
        <h3>Professional</h3>
        <div className={styles.priceAmount}>$1,000</div>
        <p className={styles.pricePeriod}>per month</p>
        
        <ul className={styles.pricingFeatures}>
          <li>AI Concierge Service</li>
          <li>Email & Scheduling Automation</li>
          <li>Smart Prioritization</li>
          <li>Configurable Rules</li>
          <li>Priority Support</li>
          <li>On-Premise Hosting Option</li>
          <li>14-Day Free Trial</li>
        </ul>
        
        <button className={styles.ctaButton}>Start Your Trial</button>
      </div>
    </section>
  )
}
