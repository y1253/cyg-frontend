import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function TermsPage() {
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

        <h1 className="text-3xl font-bold text-[#0B1C2C] mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: June 9, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8 text-[15px] leading-relaxed text-gray-700">

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the CYG Finance internal platform ("the Service"), you agree to
              be bound by these Terms of Service. If you do not agree, do not use the Service.
            </p>
            <p className="mt-3">
              Access is granted only to authorized staff of CYG Finance. Unauthorized access or
              sharing of credentials is strictly prohibited.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">2. Description of Service</h2>
            <p>
              The Service is a private bookkeeping and client management platform that allows
              authorized staff to manage client companies, tasks, schedules, and communications.
              It includes optional integrations with Google Gmail and WhatsApp to display sent
              communications in context.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">3. User Accounts</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Accounts are created by an Administrator. You are responsible for maintaining the
                confidentiality of your credentials.
              </li>
              <li>
                You must not share your account or password with anyone.
              </li>
              <li>
                You must notify an Administrator immediately if you suspect unauthorized access to
                your account.
              </li>
              <li>
                Administrators may disable or delete accounts at any time without notice.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">4. Acceptable Use</h2>
            <p>You agree to use the Service only for legitimate business purposes. You must not:</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>Access data belonging to client companies beyond what your role requires.</li>
              <li>Extract, export, or copy client data for purposes outside normal job duties.</li>
              <li>Attempt to circumvent authentication, authorization, or security measures.</li>
              <li>
                Use connected Gmail or WhatsApp access for personal use or for purposes unrelated
                to CYG Finance client management.
              </li>
              <li>Introduce malicious code, scripts, or unauthorized automation.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">5. Gmail and WhatsApp Integrations</h2>
            <p>
              When you connect your Google or WhatsApp account to the Service, you authorize CYG
              Finance to read your sent messages on your behalf for the purpose of displaying
              communication history within the platform.
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>
                Gmail access is limited to read-only retrieval of your Sent folder. We do not
                send emails on your behalf.
              </li>
              <li>
                WhatsApp access mirrors a WhatsApp Web session. We do not send messages on
                your behalf.
              </li>
              <li>
                You may disconnect either integration at any time from within the app. Doing so
                immediately revokes our access and deletes stored session credentials.
              </li>
              <li>
                You are responsible for ensuring that connecting your personal or work accounts
                to this Service complies with any policies your email or messaging provider requires.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">6. Client Data Confidentiality</h2>
            <p>
              The Service contains sensitive financial and personal information about client
              companies. All users must treat this data as strictly confidential. Disclosure of
              client data to unauthorized parties is prohibited and may result in legal liability.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">7. Intellectual Property</h2>
            <p>
              All software, design, and content in the Service are the property of CYG Finance.
              You are granted a limited, non-transferable license to use the Service solely for
              authorized work purposes. No other rights are granted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">8. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" without warranties of any kind, express or implied.
              We do not guarantee that the Service will be uninterrupted, error-free, or free of
              security vulnerabilities. Use the Service at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">9. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, CYG Finance shall not be liable for any
              indirect, incidental, special, or consequential damages arising from your use of or
              inability to use the Service, including any loss of data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">10. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your access to the Service at any time
              and for any reason without notice. Provisions that by their nature should survive
              termination (confidentiality, limitation of liability) will continue to apply.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">11. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the Province of Quebec, Canada, without
              regard to conflict of law principles. Any disputes shall be resolved in the courts
              of that jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">12. Changes to These Terms</h2>
            <p>
              We may revise these Terms at any time. The "Last updated" date at the top reflects
              the current version. Continued use of the Service after changes are posted constitutes
              your acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">13. Contact</h2>
            <p>
              Questions about these Terms? Contact us at:{' '}
              <a href="mailto:chaim@cygfinance.com" className="text-[#3BBFB4] underline">
                chaim@cygfinance.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-14 pt-8 border-t border-gray-100 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} CYG Finance ·{' '}
          <Link to="/privacy" className="text-[#3BBFB4] hover:opacity-80">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
