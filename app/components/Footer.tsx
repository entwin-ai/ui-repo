import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <div className={styles.footerSection}>
          <h4>Product</h4>
          <a href="#">Features</a>
          <a href="#">Pricing</a>
          <a href="#">Security</a>
          <a href="#">Roadmap</a>
        </div>
        <div className={styles.footerSection}>
          <h4>Company</h4>
          <a href="#">About</a>
          <a href="#">Blog</a>
          <a href="#">Careers</a>
          <a href="#">Contact</a>
        </div>
        <div className={styles.footerSection}>
          <h4>Legal</h4>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Security</a>
          <a href="#">Compliance</a>
        </div>
        <div className={styles.footerSection}>
          <h4>Connect</h4>
          <a href="#">Twitter</a>
          <a href="#">LinkedIn</a>
          <a href="#">GitHub</a>
          <a href="#">Support</a>
        </div>
      </div>
      <div className={styles.footerBottom}>
        <p>&copy; 2026 Entwin. All rights reserved. Your personal AI concierge.</p>
      </div>
    </footer>
  )
}
