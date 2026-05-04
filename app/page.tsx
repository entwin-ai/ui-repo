import Navigation from './components/Navigation'
import Hero from './components/Hero'
import Features from './components/Features'
import ValueProposition from './components/ValueProposition'
import Privacy from './components/Privacy'
import Pricing from './components/Pricing'
import CTA from './components/CTA'
import Footer from './components/Footer'

export default function Home() {
  return (
    <main>
      <Navigation />
      <Hero />
      <Features />
      <ValueProposition />
      <Privacy />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  )
}
