import styles from './Features.module.css'

const features = [
  {
    icon: '📅',
    title: 'Smart Scheduling',
    description: 'Let AI handle meeting coordination, calendar management, and booking prioritization based on your preferences and availability.'
  },
  {
    icon: '✉️',
    title: 'Email Intelligence',
    description: 'AI drafts thoughtful emails and summarizes long correspondence, extracting key action points so you stay in the loop.'
  },
  {
    icon: '🎯',
    title: 'Priority Management',
    description: 'Automatically prioritize and filter communications across email and messaging apps, surfacing only what truly needs your attention.'
  },
  {
    icon: '⚙️',
    title: 'Configurable Rules',
    description: 'Set custom guardrails and intelligent rules that adapt to your unique workflow without requiring human intervention every step.'
  },
  {
    icon: '🧠',
    title: 'Personalized Learning',
    description: 'Entwin learns your preferences, communication style, and decision patterns to improve recommendations over time.'
  },
  {
    icon: '🔒',
    title: 'Enterprise Privacy',
    description: 'Your data stays secure with enterprise-grade privacy protections and on-premise hosting options for complete control.'
  }
]

export default function Features() {
  return (
    <section className={styles.features} id="features">
      <h2 className={styles.sectionTitle}>Powerful Features</h2>
      <p className={styles.sectionSubtitle}>Everything you need to streamline your daily operations</p>
      
      <div className={styles.featuresGrid}>
        {features.map((feature, index) => (
          <div key={index} className={styles.featureCard}>
            <div className={styles.featureIcon}>{feature.icon}</div>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
