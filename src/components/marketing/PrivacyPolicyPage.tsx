import React from 'react';
import { ArrowLeft, ShieldCheck, Lock, Eye, Trash2, Mail, ExternalLink } from 'lucide-react';

interface PrivacyPolicyPageProps {
  onNavigate: (path: string) => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onNavigate }) => {
  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <div
      data-testid="privacy-policy-page"
      className="h-screen w-screen overflow-y-auto bg-[#0d1117] text-[#EDEDED] select-text"
    >
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-[#30363d] bg-[#0d1117]/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <a
            href="/"
            onClick={(e) => handleNav(e, '/')}
            data-testid="privacy-back-home-link"
            className="flex items-center space-x-3 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#D4AF37]" />
            <img
              src="/favicon-64x64.png"
              alt="Classroom Agent Logo"
              className="w-7 h-7 rounded-lg border border-[#30363d]"
            />
            <span className="font-semibold text-white">Classroom Agent</span>
          </a>

          <div className="flex items-center space-x-6 text-xs text-gray-400">
            <a
              href="/terms"
              onClick={(e) => handleNav(e, '/terms')}
              data-testid="privacy-to-terms-link"
              className="hover:text-[#D4AF37] transition-colors"
            >
              Terms of Service
            </a>
            <a
              href="/"
              onClick={(e) => handleNav(e, '/')}
              className="px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-gray-200 hover:border-[#D4AF37]/50 transition-colors"
            >
              Back to Application
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12 space-y-10">
        <div className="space-y-3 border-b border-[#30363d] pb-8">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Google API Services User Data Policy Compliant</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm text-gray-400">
            Effective Date: October 19, 2026 &bull; Last Updated: October 19, 2026
          </p>
        </div>

        {/* Highlighted Google API Limited Use Disclosure */}
        <section
          data-testid="google-limited-use-disclosure"
          className="rounded-xl bg-[#161b22] border border-[#D4AF37]/40 p-6 space-y-3 shadow-lg"
        >
          <div className="flex items-center space-x-2 text-[#D4AF37] font-semibold text-base">
            <Lock className="w-5 h-5 shrink-0" />
            <h2>Google API Services User Data Policy &amp; Limited Use Disclosure</h2>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed">
            Classroom Agent&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D4AF37] underline hover:text-[#E5B869] inline-flex items-center gap-1"
            >
              Google API Services User Data Policy
              <ExternalLink className="w-3 h-3" />
            </a>
            , including the Limited Use requirements.
          </p>
          <ul className="list-disc list-inside text-xs text-gray-300 space-y-1.5 pt-1">
            <li>
              We <strong>never</strong> use Google Workspace, Google Classroom, or Google Drive data to train, fine-tune, or improve generalized or foundation artificial intelligence / machine learning models.
            </li>
            <li>
              We <strong>never</strong> sell, rent, or transfer Google user data to third parties, advertising networks, data brokers, or information resellers.
            </li>
            <li>
              We only access, process, and store Google user data strictly to provide teacher-facing grading, rubric evaluation, and feedback generation features directly requested by the authenticated educator.
            </li>
          </ul>
        </section>

        {/* 1. Overview */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">1. Introduction &amp; Who We Are</h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            Classroom Agent (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;), operated by Kieren Holt and hosted at{' '}
            <code className="text-xs bg-[#161b22] px-1.5 py-0.5 rounded border border-[#30363d]">
              https://classroomagent.co.uk
            </code>
            , is an AI-assisted grading and feedback workstation built for educators using Google Classroom. This Privacy Policy explains what information we collect, why we request specific Google OAuth permissions, how data is processed and stored, and how you can exercise your data rights.
          </p>
        </section>

        {/* 2. Google OAuth Scopes */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <Eye className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-xl font-semibold text-white">
              2. Google OAuth Permissions &amp; Data We Access
            </h2>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            When you sign in with Google Classroom, Classroom Agent requests your explicit consent for the minimum set of Google OAuth 2.0 scopes required to operate the grading workstation:
          </p>

          <div className="overflow-x-auto rounded-xl border border-[#30363d]">
            <table className="w-full text-left text-xs text-gray-300 border-collapse">
              <thead>
                <tr className="bg-[#161b22] border-b border-[#30363d] text-gray-200">
                  <th className="py-3 px-4 font-semibold">OAuth Scope</th>
                  <th className="py-3 px-4 font-semibold">Data Accessed &amp; Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d] bg-[#0d1117]">
                <tr>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#D4AF37]">
                    .../auth/classroom.courses.readonly
                  </td>
                  <td className="py-3 px-4">
                    Reads the list of active Google Classroom courses where you are an enrolled teacher so you can select which class to grade.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#D4AF37]">
                    .../auth/classroom.rosters.readonly
                  </td>
                  <td className="py-3 px-4">
                    Reads the student roster for your selected course so student names and submission turn-in statuses are displayed accurately in the grading workspace.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#D4AF37]">
                    .../auth/classroom.coursework.students
                  </td>
                  <td className="py-3 px-4">
                    Reads coursework assignments, rubrics, and student submissions, and writes back teacher-approved draft grades (<code className="text-gray-200">draftGrade</code>), final grades (<code className="text-gray-200">assignedGrade</code>), and submission return actions to Google Classroom.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#D4AF37]">
                    .../auth/drive.file
                  </td>
                  <td className="py-3 px-4">
                    Accesses Google Drive files created or opened with Classroom Agent, and creates formatted Google Doc feedback documents in Google Drive and attaches them to student submissions when you click Approve / Publish.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 3. How We Store Data (Live Classroom + Firestore Sidecar) */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            3. Data Storage Architecture &amp; Retention
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            Classroom Agent follows a <strong>Live Google Classroom Reads + Cloud Firestore Sidecar</strong> architecture hosted on Google Cloud Platform (<code className="text-xs bg-[#161b22] px-1.5 py-0.5 rounded border border-[#30363d]">europe-west2</code>, London, United Kingdom):
          </p>
          <ul className="list-disc list-inside text-sm text-gray-300 space-y-2">
            <li>
              <strong>No Duplicate Roster or Drive File Storage:</strong> Student rosters, course lists, and original student-submitted Drive files are fetched live from Google Classroom and Google Drive APIs using your short-lived OAuth access token and are not permanently duplicated in our database.
            </li>
            <li>
              <strong>Cloud Firestore Sidecar Storage:</strong> We store only the supplementary grading state that Google Classroom&apos;s API does not natively store:
              <ul className="list-disc list-inside ml-6 mt-1.5 text-xs text-gray-400 space-y-1">
                <li>Assignment grading rubrics (<code className="text-gray-300">assignments/&#123;assignmentId&#125;</code>)</li>
                <li>Per-criterion rubric breakdowns, written feedback drafts, and sync status (<code className="text-gray-300">evaluations/&#123;studentId&#125;</code>)</li>
                <li>Your co-pilot chat history for an assignment (<code className="text-gray-300">messages/&#123;messageId&#125;</code>)</li>
                <li>Your teacher account profile and AI credit balance (<code className="text-gray-300">users/&#123;uid&#125;</code>)</li>
              </ul>
            </li>
            <li>
              <strong>OAuth Access Tokens:</strong> Your Google OAuth access token is held in your browser session (<code className="text-xs bg-[#161b22] px-1 py-0.5 rounded">sessionStorage</code>) with a strict 55-minute expiration TTL and forwarded over HTTPS only during active API calls. We do not store raw OAuth access or refresh tokens in our database.
            </li>
          </ul>
        </section>

        {/* 4. AI Processing & Third-Party Subprocessors */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            4. Artificial Intelligence Processing &amp; Subprocessors
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            When you instruct the Classroom Agent Co-Pilot to evaluate a student submission or generate a rubric, the assignment prompt, rubric criteria, and extracted submission text are transmitted securely over HTTPS to the <strong>Google Gemini API</strong> (paid enterprise/API billing tier). Under Google&apos;s API data governance terms, prompts and responses sent via the paid Gemini API are <strong>not</strong> used to train Google models or shared with other customers.
          </p>
          <p className="text-sm text-gray-300 leading-relaxed">
            We rely solely on the following infrastructure subprocessors:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-300 space-y-1.5">
            <li>
              <strong>Google Cloud Platform &amp; Firebase (europe-west2, UK):</strong> Application hosting, authentication (Firebase Auth), serverless backend execution (Cloud Functions), and database storage (Cloud Firestore).
            </li>
            <li>
              <strong>Google Gemini API:</strong> On-demand AI evaluation and feedback drafting initiated by the educator.
            </li>
            <li>
              <strong>Stripe, Inc.:</strong> Optional payment processing when purchasing additional AI credit top-ups. Classroom Agent never receives or stores your credit card details.
            </li>
          </ul>
        </section>

        {/* 5. User Rights, Revocation & Data Deletion */}
        <section className="space-y-3">
          <div className="flex items-center space-x-2">
            <Trash2 className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-xl font-semibold text-white">
              5. Revoking Access &amp; Requesting Data Deletion
            </h2>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            You maintain full control over your account and Google Classroom data at all times:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-300 space-y-2">
            <li>
              <strong>Revoke Google OAuth Permissions:</strong> You can revoke Classroom Agent&apos;s access to your Google account at any time by visiting your{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#D4AF37] underline hover:text-[#E5B869]"
              >
                Google Account Third-Party Connections page
              </a>
              .
            </li>
            <li>
              <strong>Delete Stored Data:</strong> You may request complete deletion of your teacher account record (<code className="text-xs bg-[#161b22] px-1 py-0.5 rounded">users/&#123;uid&#125;</code>), stored rubrics, evaluation drafts, and co-pilot chat history by emailing{' '}
              <a
                href="mailto:kierenholt@gmail.com"
                className="text-[#D4AF37] underline hover:text-[#E5B869]"
              >
                kierenholt@gmail.com
              </a>
              . We process all deletion requests within 7 calendar days.
            </li>
          </ul>
        </section>

        {/* 6. Contact Information */}
        <section className="rounded-xl bg-[#161b22] border border-[#30363d] p-6 space-y-2">
          <div className="flex items-center space-x-2 text-white font-semibold">
            <Mail className="w-4 h-4 text-[#D4AF37]" />
            <h2>6. Contact &amp; Data Protection Inquiries</h2>
          </div>
          <p className="text-sm text-gray-300">
            If you have any questions about this Privacy Policy, our Google API data practices, or UK GDPR / data protection compliance, please contact:
          </p>
          <p className="text-sm text-gray-200 font-medium pt-1">
            Kieren Holt — Classroom Agent Support
            <br />
            Email:{' '}
            <a
              href="mailto:kierenholt@gmail.com"
              className="text-[#D4AF37] underline hover:text-[#E5B869]"
            >
              kierenholt@gmail.com
            </a>
          </p>
        </section>
      </main>
    </div>
  );
};
