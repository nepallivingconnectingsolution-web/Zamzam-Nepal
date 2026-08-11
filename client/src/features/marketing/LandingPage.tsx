import { PublicNavbar } from "@/components/layout/public-navbar";
import { Footer } from "@/components/layout/footer";
import {
  AiSection,
  AppShowcase,
  ContactSection,
  InvestorsSection,
  PartnersSection,
  ServicesSection,
} from "./sections/blocks";

/**
 * The marketing site, now reachable only at /about.
 *
 * "/" used to render this, which is why the product opened on a pitch: an
 * eyebrow, a headline, a paragraph, two CTAs, and only then the services. That
 * hero is deleted; the app's front door is AppHome. What survives here is the
 * material an app screen genuinely can't carry — the partner, investor and
 * contact story — for links that point at it.
 *
 * `pt-24` replaces the spacing the hero used to provide beneath the fixed
 * navbar; without it the first section slid underneath the bar.
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <PublicNavbar />
      <main className="pt-24">
        <ServicesSection />
        <AiSection />
        <PartnersSection />
        <AppShowcase />
        <InvestorsSection />
        <ContactSection />
      </main>
      <Footer />
    </div>
  );
}
