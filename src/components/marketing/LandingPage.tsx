import React from 'react';
import {
  Sparkles,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  FileText,
  Sliders,
  Zap,
  ShieldCheck,
  Lock,
  Layers,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';

interface LandingPageProps {
  onSignIn: () => Promise<void>;
  signingIn: boolean;
  authError: string | null;
  tokenExpiredWarning: boolean;
  onNavigate: (path: string) => void;
}

const GoogleGLogo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
    <path fill="none" d="M0 0h48v48H0z" />
  </svg>
);

export const LandingPage: React.FC<LandingPageProps> = ({
  onSignIn,
  signingIn,
  authError,
  tokenExpiredWarning,
  onNavigate,
}) => {
  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <div
      data-testid="marketing-landing-page"
      className="h-screen w-screen overflow-y-auto bg-[#0d1117] text-[#EDEDED] select-text"
    >
      {/* Sticky Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-[#30363d] bg-[#0d1117]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img
              src="/logo-192x192.png"
              alt="Classroom Agent Logo"
              className="w-9 h-9 rounded-xl border border-[#D4AF37]/40 shadow-sm"
            />
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-lg text-white tracking-tight">Classroom Agent</span>
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-8 text-xs font-medium text-gray-300">
            <a href="#features" className="hover:text-[#D4AF37] transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[#D4AF37] transition-colors">
              How It Works
            </a>
            <a href="#data-privacy" className="hover:text-[#D4AF37] transition-colors">
              Data Privacy &amp; Scopes
            </a>
            <a href="#pricing" className="hover:text-[#D4AF37] transition-colors">
              Pricing
            </a>
            <a
              href="/privacy"
              onClick={(e) => handleNav(e, '/privacy')}
              data-testid="landing-nav-privacy-link"
              className="hover:text-[#D4AF37] transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              onClick={(e) => handleNav(e, '/terms')}
              data-testid="landing-nav-terms-link"
              className="hover:text-[#D4AF37] transition-colors"
            >
              Terms
            </a>
          </nav>

          <button
            onClick={onSignIn}
            disabled={signingIn}
            data-testid="navbar-google-signin-button"
            className="flex items-center space-x-2.5 px-4 py-2 rounded-lg bg-white hover:bg-gray-100 text-[#1f1f1f] font-medium text-xs transition-all shadow-sm disabled:opacity-50 cursor-pointer border border-gray-300"
          >
            {signingIn ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-700" />
            ) : (
              <GoogleGLogo className="w-4 h-4" />
            )}
            <span>Sign in with Google</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-14 pb-20 border-b border-[#30363d]">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Value Proposition + Official Google Sign-In Card */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI-Native Grading &amp; Feedback Workstation for Google Classroom</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
              Grade Google Classroom Assignments in a Fraction of the Time.
            </h1>

            <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-2xl">
              Classroom Agent pairs a live <strong>70% Assignment &amp; Submission Preview Workspace</strong> with a <strong>30% Streaming AI Co-Pilot</strong>. Inspect student Google Docs, PDFs, Slides, and code side-by-side with your rubric, draft individualized feedback, and publish grades and formatted Google Doc feedback directly back to Google Classroom.
            </p>

            {/* Alerts for Expired Token or Auth Error */}
            {tokenExpiredWarning && (
              <div className="max-w-md p-3 bg-amber-950/50 border border-amber-800/60 rounded-lg text-amber-200 text-xs flex items-center space-x-2 text-left">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  Your Google Classroom OAuth token has expired. Please sign in again to refresh Classroom access.
                </span>
              </div>
            )}

            {authError && (
              <div className="max-w-md p-3 bg-red-950/60 border border-red-800/60 rounded-lg text-red-300 text-xs flex items-center space-x-2 text-left">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {/* Primary CTA Buttons (Official Google Branding + E2E Test Compatible Label) */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4">
              <button
                onClick={onSignIn}
                disabled={signingIn}
                data-testid="hero-google-signin-button"
                className="inline-flex items-center justify-center space-x-3 py-3 px-6 rounded-xl bg-white hover:bg-gray-100 text-[#1f1f1f] font-semibold text-sm transition-all shadow-lg shadow-black/30 disabled:opacity-50 cursor-pointer border border-gray-300"
              >
                {signingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-gray-700" />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <GoogleGLogo className="w-5 h-5 shrink-0" />
                    <span>Sign in with Google Classroom</span>
                  </>
                )}
              </button>

              <div className="text-xs text-gray-400 space-y-0.5">
                <div className="text-gray-200 font-medium">100 Free AI Grading Credits Included</div>
                <div>No credit card required &bull; Works with existing courses</div>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed max-w-xl">
              By signing in, you agree to our{' '}
              <a
                href="/terms"
                onClick={(e) => handleNav(e, '/terms')}
                data-testid="hero-terms-link"
                className="text-[#D4AF37] underline hover:text-[#E5B869]"
              >
                Terms of Service
              </a>{' '}
              and{' '}
              <a
                href="/privacy"
                onClick={(e) => handleNav(e, '/privacy')}
                data-testid="hero-privacy-link"
                className="text-[#D4AF37] underline hover:text-[#E5B869]"
              >
                Privacy Policy
              </a>
              . Requires Google Classroom &amp; Google Drive permissions to inspect student submissions and sync grades.
            </p>
          </div>

          {/* Right Column: Brand Card & 70/30 Workstation Preview */}
          <div className="lg:col-span-5">
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex items-center space-x-4 border-b border-[#30363d] pb-4">
                <img
                  src="/logo-192x192.png"
                  alt="Classroom Agent App Icon"
                  className="w-14 h-14 rounded-2xl border border-[#D4AF37]/40 shadow-md"
                />
                <div>
                  <h2 className="text-base font-bold text-white">70/30 AI Grading Workstation</h2>
                  <p className="text-xs text-gray-400">
                    Live Google Classroom Sync + Human-in-the-Loop Approval
                  </p>
                </div>
              </div>

              {/* Miniature 70/30 Workspace Diagram */}
              <div className="grid grid-cols-10 gap-2 bg-[#0d1117] p-3 rounded-xl border border-[#30363d] text-[11px]">
                <div className="col-span-7 bg-[#161b22] border border-[#30363d] rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-[#D4AF37] font-semibold">
                    <span>70% Assignment Workspace</span>
                    <span className="text-[10px] bg-[#D4AF37]/15 px-1.5 py-0.5 rounded">Live API</span>
                  </div>
                  <p className="text-gray-400 leading-snug">
                    Student roster, multi-format Google Drive submission viewer (Docs, PDFs, Slides, Code), and interactive rubric breakdown.
                  </p>
                </div>
                <div className="col-span-3 bg-[#161b22] border border-[#D4AF37]/30 rounded-lg p-3 space-y-2">
                  <div className="text-[#D4AF37] font-semibold">30% AI Co-Pilot</div>
                  <p className="text-gray-400 leading-snug">
                    Streams criterion scores, constructive feedback &amp; Next Steps ready for 1-click teacher approval.
                  </p>
                </div>
              </div>

              <ul className="space-y-2 text-xs text-gray-300">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Reads live courses, rosters, rubrics, and turned-in Drive files</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Attaches formatted Google Doc feedback reports directly to student work</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Publishes draft or final numerical grades directly to Google Classroom</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section id="features" className="py-16 border-b border-[#30363d]">
        <div className="max-w-6xl mx-auto px-6 space-y-10">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-bold text-white">Built Specifically for Google Classroom Educators</h2>
            <p className="text-sm text-gray-400">
              No manual CSV exports or copy-pasting student essays. Everything stays synced with your existing Google Classroom courses.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-white">Multi-Tab Class Workspace</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Keep multiple assignments open in persistent tabs. Switch seamlessly between classes and students with zero reload delay.
              </p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-white">Instant Drive Preview Canvas</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Inspect student-submitted Google Docs, Slides, Sheets, PDFs, images, and code files directly inside the grading canvas.
              </p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
                <Sliders className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-white">Rubric-Aligned AI Evaluations</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Import existing Classroom rubrics or generate new ones with AI. Customize feedback tone, detail level, and custom instructions.
              </p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-white">Google Doc Feedback Write-Back</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Preview, edit, and approve AI-drafted feedback to automatically generate a clean Google Doc attached to the student&apos;s submission.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works (3 Steps) */}
      <section id="how-it-works" className="py-16 border-b border-[#30363d] bg-[#12161f]/40">
        <div className="max-w-6xl mx-auto px-6 space-y-10">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-bold text-white">How Classroom Agent Works</h2>
            <p className="text-sm text-gray-400">
              Three streamlined steps from turned-in student work to published feedback.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-2">
              <div className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">Step 1</div>
              <h3 className="text-base font-semibold text-white">Select a Course &amp; Assignment</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Sign in with your Google Teacher account and pick any active course and coursework assignment—or create a new assignment directly from the picker.
              </p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-2">
              <div className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">Step 2</div>
              <h3 className="text-base font-semibold text-white">Run the AI Grading Co-Pilot</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Select one or more turned-in students and click <strong>Grade Selected</strong>. The Co-Pilot reads each student&apos;s Drive attachment, scores each rubric criterion, and drafts personalized feedback.
              </p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-2">
              <div className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">Step 3</div>
              <h3 className="text-base font-semibold text-white">Review, Edit &amp; Publish to Classroom</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Inspect or tweak any score or paragraph in the Preview Modal, then click <strong>Approve</strong> to attach the feedback Google Doc and return the grade to the student in Google Classroom.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Google Data Privacy & OAuth Transparency Section */}
      <section id="data-privacy" className="py-16 border-b border-[#30363d]">
        <div className="max-w-6xl mx-auto px-6 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center space-x-2 text-[#D4AF37] text-xs font-semibold uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>Google OAuth &amp; Student Data Transparency</span>
              </div>
              <h2 className="text-2xl font-bold text-white">
                How Classroom Agent Uses &amp; Protects Your Google Data
              </h2>
              <p className="text-sm text-gray-400">
                Classroom Agent strictly adheres to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#D4AF37] underline hover:text-[#E5B869] inline-flex items-center gap-1"
                >
                  Google API Services User Data Policy (Limited Use)
                  <ExternalLink className="w-3 h-3" />
                </a>
                .
              </p>
            </div>

            <a
              href="/privacy"
              onClick={(e) => handleNav(e, '/privacy')}
              data-testid="privacy-section-link"
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#161b22] border border-[#D4AF37]/40 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors self-start"
            >
              <Lock className="w-4 h-4" />
              <span>Read Full Privacy Policy</span>
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-2">
              <h3 className="font-semibold text-white text-sm">Zero AI Model Training</h3>
              <p className="text-gray-400 leading-relaxed">
                Student submissions, grades, and teacher rubrics accessed from Google Classroom and Google Drive are <strong>never</strong> used to train or fine-tune foundation AI models.
              </p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-2">
              <h3 className="font-semibold text-white text-sm">Live Classroom Source of Truth</h3>
              <p className="text-gray-400 leading-relaxed">
                Course lists, student rosters, and original student Drive attachments are read live from Google APIs using your session token—never sold or shared with third parties.
              </p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-2">
              <h3 className="font-semibold text-white text-sm">Transparent Scope Usage</h3>
              <p className="text-gray-400 leading-relaxed">
                We request Classroom &amp; Drive permissions strictly to list your active courses, display student work in the grading canvas, attach feedback Google Docs, and sync grades.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing & Free Credits Callout */}
      <section id="pricing" className="py-16 border-b border-[#30363d] bg-[#12161f]/40">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-medium">
            <Zap className="w-3.5 h-3.5" />
            <span>Simple, Transparent Usage Credits</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Start Grading Immediately with 100 Free AI Credits
          </h2>
          <p className="text-sm text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Every teacher account receives <strong>100 complimentary AI credits</strong> upon first sign-in (1 credit = 1 AI-evaluated student submission). Manual grading, rubric creation, and submission previewing are always free. Top up +100 credits anytime via Stripe.
          </p>
          <div className="pt-2 flex justify-center">
            <button
              onClick={onSignIn}
              disabled={signingIn}
              className="inline-flex items-center space-x-3 py-3 px-6 rounded-xl bg-white hover:bg-gray-100 text-[#1f1f1f] font-semibold text-sm transition-all shadow-md disabled:opacity-50 cursor-pointer border border-gray-300"
            >
              <GoogleGLogo className="w-5 h-5" />
              <span>Get Started Free with Google</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer with Required Legal Links */}
      <footer className="py-10 bg-[#0d1117] text-xs text-gray-400">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <img
              src="/favicon-64x64.png"
              alt="Classroom Agent"
              className="w-6 h-6 rounded-md border border-[#30363d]"
            />
            <span>&copy; {new Date().getFullYear()} Classroom Agent. Operated by Kieren Holt.</span>
          </div>

          <div className="flex items-center space-x-6">
            <a
              href="/privacy"
              onClick={(e) => handleNav(e, '/privacy')}
              data-testid="footer-privacy-link"
              className="text-gray-300 hover:text-[#D4AF37] underline transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              onClick={(e) => handleNav(e, '/terms')}
              data-testid="footer-terms-link"
              className="text-gray-300 hover:text-[#D4AF37] underline transition-colors"
            >
              Terms of Service
            </a>
            <a
              href="mailto:kierenholt@gmail.com"
              className="text-gray-300 hover:text-[#D4AF37] transition-colors"
            >
              kierenholt@gmail.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
