import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm text-[#3BBFB4] hover:opacity-80 mb-10"
        >
          <ArrowLeft size={15} />
          Back to login
        </Link>

        <h1 className="text-3xl font-bold text-[#0B1C2C] mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: June 9, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8 text-[15px] leading-relaxed text-gray-700">

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">1. Introduction</h2>
            <p>
              CYG Finance ("we", "us", or "our") operates an internal business management platform
              for our bookkeeping and accounting team. This Privacy Policy explains what information
              we collect, how we use it, and your rights regarding that information.
            </p>
            <p className="mt-3">
              This application is a private, invite-only tool used exclusively by authorized staff.
              It is not a public consumer product.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">2. Information We Collect</h2>
            <p>We collect the following categories of information:</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>
                <strong>Account information:</strong> Name, email address, and role assigned by an
                administrator when your account is created.
              </li>
              <li>
                <strong>Authentication data:</strong> Hashed passwords. Optionally, facial recognition
                data (Luxand face ID) used as a login method — stored as a numeric identifier, not a
                raw image.
              </li>
              <li>
                <strong>Google account access (Gmail):</strong> If you connect your Google account,
                we request read-only access to your Gmail "Sent" folder. We store OAuth tokens
                (access token + refresh token) to retrieve sent emails on your behalf. We do not store
                email content on our servers beyond what is temporarily fetched and displayed in your
                browser session.
              </li>
              <li>
                <strong>WhatsApp session data:</strong> If you connect WhatsApp, session credentials
                (equivalent to being logged into WhatsApp Web) are stored server-side to retrieve
                your sent messages. No message content is persisted.
              </li>
              <li>
                <strong>Client company data:</strong> Business names, contact details, billing
                information, and task records entered by staff as part of normal bookkeeping
                operations.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To authenticate you and control access to the platform.</li>
              <li>
                To display your sent Gmail emails and WhatsApp messages alongside the relevant
                client company records, so your team has a unified communication history.
              </li>
              <li>To manage tasks, schedules, and todos associated with client companies.</li>
              <li>For internal auditing and administrative purposes.</li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> sell, rent, or share your data with third parties for
              marketing or advertising purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">4. Google API Scopes</h2>
            <p>
              When you connect your Gmail account, we request the following OAuth 2.0 scope:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1">
              <li>
                <code className="text-sm bg-gray-100 px-1 py-0.5 rounded">
                  https://www.googleapis.com/auth/gmail.readonly
                </code>{' '}
                — read-only access to your Gmail messages and metadata.
              </li>
            </ul>
            <p className="mt-3">
              We only read messages from your <strong>Sent</strong> folder, and only display them
              within this application. We do not read, store, or process any other mailbox folder.
              You can revoke this access at any time from your{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#3BBFB4] underline"
              >
                Google Account permissions page
              </a>{' '}
              or by clicking "Disconnect Gmail" inside the app.
            </p>
            <p className="mt-3">
              Our use of Google user data is limited to the practices described in this policy and
              complies with the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#3BBFB4] underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">5. Data Storage and Security</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Data is stored in a MySQL database hosted on a private Hetzner server.</li>
              <li>
                Billing passwords for client companies are encrypted with AES-256 before storage.
              </li>
              <li>
                Google OAuth tokens are stored encrypted in the database and used only to fetch
                your sent emails.
              </li>
              <li>
                All data in transit is protected by TLS/HTTPS in production.
              </li>
              <li>
                Access to the application is restricted to authenticated staff with assigned roles.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">6. Data Retention</h2>
            <p>
              Staff account data is retained for as long as your account is active. Soft-deleted
              accounts have their personal data retained for audit purposes but lose login access.
              OAuth tokens are deleted immediately when you disconnect an integration or when your
              account is removed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">7. Your Rights</h2>
            <p>
              As an authorized user of this platform, you may request access to, correction of, or
              deletion of your personal data by contacting your system administrator or emailing us
              at the address below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. The "Last updated" date at the
              top of this page reflects the most recent revision. Continued use of the platform
              after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">9. Contact</h2>
            <p>
              For privacy-related questions or requests, contact us at:{' '}
              <a href="mailto:chaim@cygfinance.com" className="text-[#3BBFB4] underline">
                chaim@cygfinance.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-14 pt-8 border-t border-gray-100 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} CYG Finance ·{' '}
          <Link to="/terms" className="text-[#3BBFB4] hover:opacity-80">
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}
