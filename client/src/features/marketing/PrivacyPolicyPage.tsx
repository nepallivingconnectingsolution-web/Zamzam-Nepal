import { PublicNavbar } from "@/components/layout/public-navbar";
import { Footer } from "@/components/layout/footer";

/**
 * Public, unauthenticated privacy policy page — required by Google Play
 * (and the App Store) as a real, live URL, not a PDF or a placeholder link.
 * Linked from the footer's "Privacy" link and from the Play Console store
 * listing as https://zamzam.com.np/privacy.
 */
export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-bg">
      <PublicNavbar />
      <main className="pt-24">
        <div className="container max-w-3xl py-16">
          <h1 className="font-display text-display font-bold text-fg">Privacy Policy</h1>
          <p className="mt-2 text-body-sm text-muted-fg">Last updated: September 6, 2026</p>

          <p className="mt-8 text-body leading-relaxed text-muted-fg">
            Zamzam ("we", "our", "us") operates the Zamzam mobile app and website
            (zamzam.com.np). This policy explains what information we collect and how we use it.
          </p>

          <section className="mt-10">
            <h2 className="font-display text-h1 font-semibold text-fg">Information We Collect</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-body leading-relaxed text-muted-fg">
              <li>
                <span className="text-fg">Account info:</span> your name, email address, and
                phone number when you register.
              </li>
              <li>
                <span className="text-fg">Location data:</span> your device's GPS location, used
                to find nearby drivers, set pickup points, and show live tracking for rides and
                deliveries.
              </li>
              <li>
                <span className="text-fg">Documents and photos:</span> identity and vehicle
                documents uploaded by drivers and partners for verification purposes.
              </li>
              <li>
                <span className="text-fg">Booking and transaction history:</span> rides, orders,
                bus tickets, and hotel bookings you make through the app.
              </li>
              <li>
                <span className="text-fg">Payment information:</span> processed through our
                payment partners; we do not store your full card or payment account details on our
                own servers.
              </li>
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-h1 font-semibold text-fg">How We Use Your Information</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-body leading-relaxed text-muted-fg">
              <li>To provide and improve our ride, delivery, bus, freight, grocery, and hotel booking services.</li>
              <li>To verify driver and partner identity and documents.</li>
              <li>To show live location during an active ride or delivery.</li>
              <li>To contact you about your bookings or account.</li>
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-h1 font-semibold text-fg">Sharing of Information</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-body leading-relaxed text-muted-fg">
              <li>With drivers/partners only as needed to complete your booking (e.g. your pickup location and name).</li>
              <li>With payment processors to complete transactions.</li>
              <li>We do not sell your personal information to third parties.</li>
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-h1 font-semibold text-fg">Your Choices</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-body leading-relaxed text-muted-fg">
              <li>You can request access to, correction of, or deletion of your account data by contacting us below.</li>
              <li>You can disable location permissions in your phone settings, though this will limit app features like live tracking.</li>
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-h1 font-semibold text-fg">Data Security</h2>
            <p className="mt-4 text-body leading-relaxed text-muted-fg">
              We take reasonable steps to protect your data, but no method of storage or
              transmission is 100% secure.
            </p>
          </section>

          <section className="mt-10 border-t border-border pt-8">
            <h2 className="font-display text-h1 font-semibold text-fg">Contact Us</h2>
            <p className="mt-4 text-body leading-relaxed text-muted-fg">
              If you have questions about this policy, contact us at{" "}
              <a href="mailto:info@zamzam.com.np" className="text-fg underline underline-offset-2">
                info@zamzam.com.np
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}