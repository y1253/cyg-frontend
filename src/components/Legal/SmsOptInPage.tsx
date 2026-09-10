import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { LegalPlaceholder } from './LegalPlaceholder';

/**
 * The public SMS opt-in page, published for A2P 10DLC campaign registration.
 *
 * ── WHAT A REVIEWER IS LOOKING FOR ──────────────────────────────────────────────
 * The Campaign Registry vets this page before a campaign is approved, against CTIA's
 * messaging principles. Every one of these is required and each has cost campaigns an
 * approval by being absent:
 *
 *   - the sending brand named explicitly;
 *   - what the messages are and how often they come;
 *   - "message and data rates may apply", in those words;
 *   - STOP to opt out and HELP for help;
 *   - Terms and Privacy links **beside the phone field**, not only in the footer;
 *   - a checkbox that starts UNCHECKED — pre-ticked consent is not consent.
 *
 * ⚠️ THE FORM DELIBERATELY STORES NOTHING, and the confirmation is worded so it does not
 * claim otherwise. A form that answers "you're subscribed" while recording nothing misleads
 * the person filling it in and leaves the firm with no consent record to point at if a
 * message is ever disputed. If this page is what gets declared to TCR as the opt-in
 * mechanism, it has to be wired to something first.
 *
 * Styling copies PrivacyPage/TermsPage verbatim rather than the login theme: the
 * inline-style exception in CLAUDE.md is carved out for LoginPage specifically.
 */
export function SmsOptInPage() {
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

        <h1 className="text-3xl font-bold text-[#0B1C2C] mb-2">
          Text Message Program
        </h1>
        <p className="text-sm text-gray-500 mb-10">
          Last updated: September 9, 2026
        </p>

        <div className="prose prose-slate max-w-none space-y-8 text-[15px] leading-relaxed text-gray-700">
          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">
              About this program
            </h2>
            <p>
              CYG Finance (<LegalPlaceholder>LEGAL ENTITY NAME</LegalPlaceholder>) is a
              bookkeeping and accounting firm. We send text messages to the clients whose
              books we keep, at the mobile number they give us, so that routine
              bookkeeping matters can be handled without a phone call.
            </p>
            <p className="mt-3">
              This is a customer-care program for existing clients. We do not send
              marketing or promotional text messages, and we do not text people who are
              not our clients.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">
              What you will receive
            </h2>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>Requests for documents we need to complete your books.</li>
              <li>Updates on the status of a filing or a reconciliation.</li>
              <li>Reminders about an upcoming deadline or a scheduled call.</li>
              <li>Replies to a question you have sent us.</li>
            </ul>
            <p className="mt-4 text-sm text-gray-600">
              Example messages:
            </p>
            <div className="mt-2 space-y-2">
              {[
                'CYG Finance: Hi Dana, we need your August bank statement to close the month. Reply here or email chaim@cygfinance.com. Reply STOP to unsubscribe.',
                'CYG Finance: Your Q3 GST/QST return has been filed. Nothing further is needed from you. Reply STOP to unsubscribe.',
                'CYG Finance: Reminder — your call with your accountant is tomorrow at 10:00 AM. Reply STOP to unsubscribe.',
              ].map((sample) => (
                <p
                  key={sample}
                  className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-600"
                >
                  {sample}
                </p>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">
              Message frequency and cost
            </h2>
            <p>
              Message frequency varies and depends on the work in progress on your
              account. In a typical month a client receives a small number of messages.
            </p>
            <p className="mt-3">
              <strong>Message and data rates may apply.</strong> CYG Finance does not
              charge for these messages; any charge comes from your own mobile carrier
              under your plan.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">
              How to opt out, and how to get help
            </h2>
            <p>
              Reply <strong>STOP</strong> to any message to stop receiving them. You can
              also reply UNSUBSCRIBE, END, QUIT or CANCEL. Opting out stops the text
              messages only — we will still reach you by email or phone about your
              bookkeeping.
            </p>
            <p className="mt-3">
              Reply <strong>HELP</strong> for help, or contact us at{' '}
              <a
                href="mailto:chaim@cygfinance.com"
                className="text-[#3BBFB4] underline"
              >
                chaim@cygfinance.com
              </a>{' '}
              or <LegalPlaceholder>SUPPORT PHONE</LegalPlaceholder>.
            </p>
            <p className="mt-3">
              Carriers are not liable for delayed or undelivered messages.
            </p>
          </section>

          {/* ── The opt-in call-to-action ──────────────────────────────────
              The disclosure and the two links sit INSIDE this block, beside the
              phone field. Carriers check for them here specifically — a link that
              only appears in the page footer has repeatedly been treated as absent. */}
          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">
              Sign up for text messages
            </h2>

            {submitted ? (
              <div className="rounded-lg border border-[#3BBFB4]/40 bg-[#3BBFB4]/5 px-4 py-4">
                <p className="text-[15px] text-[#0B1C2C]">
                  Thanks — we have your request.
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  A member of the team will confirm with you directly before any text
                  message is sent to {phone || 'your number'}.
                </p>
              </div>
            ) : (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(true);
                }}
                className="rounded-lg border border-gray-200 p-4 not-prose"
              >
                <label
                  htmlFor="sms-phone"
                  className="block text-sm font-medium text-[#0B1C2C]"
                >
                  Mobile number
                </label>
                <input
                  id="sms-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(438) 555-0123"
                  className="mt-1.5 w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#3BBFB4] focus:ring-1 focus:ring-[#3BBFB4]"
                />

                <label className="mt-4 flex items-start gap-2.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    // Unchecked by default, and never defaulted otherwise: pre-ticked
                    // consent is not consent, and it fails vetting on sight.
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-[#3BBFB4]"
                  />
                  <span>
                    By checking this box and providing your mobile number, you agree to
                    receive SMS messages from CYG Finance. Message frequency varies.
                    Message and data rates may apply. Reply STOP to unsubscribe or HELP
                    for help. See our{' '}
                    <Link to="/terms" className="text-[#3BBFB4] underline">
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link to="/privacy" className="text-[#3BBFB4] underline">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={!agreed || phone.trim().length === 0}
                  className="mt-4 rounded-md bg-[#3BBFB4] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Sign up
                </button>

                <p className="mt-3 text-xs text-gray-500">
                  Consent to receive text messages is not a condition of any purchase or
                  of our services.
                </p>
              </form>
            )}
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0B1C2C] mb-3">Contact</h2>
            <p>
              CYG Finance
              <br />
              <LegalPlaceholder>LEGAL ENTITY NAME</LegalPlaceholder>
              <br />
              <LegalPlaceholder>MAILING ADDRESS</LegalPlaceholder>
              <br />
              <a
                href="mailto:chaim@cygfinance.com"
                className="text-[#3BBFB4] underline"
              >
                chaim@cygfinance.com
              </a>
              <br />
              <LegalPlaceholder>SUPPORT PHONE</LegalPlaceholder>
            </p>
          </section>
        </div>

        <div className="mt-14 pt-8 border-t border-gray-100 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} CYG Finance ·{' '}
          <Link to="/privacy" className="text-[#3BBFB4] hover:opacity-80">
            Privacy Policy
          </Link>{' '}
          ·{' '}
          <Link to="/terms" className="text-[#3BBFB4] hover:opacity-80">
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}
