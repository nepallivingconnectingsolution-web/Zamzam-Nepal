import { PublicNavbar } from "@/components/layout/public-navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "./sections/hero";
import {
  AiSection,
  AppShowcase,
  ContactSection,
  InvestorsSection,
  PartnersSection,
  ServicesSection,
} from "./sections/blocks";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <PublicNavbar />
      <main>
        <Hero />
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
