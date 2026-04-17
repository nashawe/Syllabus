import Nav from "./Nav";

const API =
  import.meta.env.VITE_API_URL || "https://syllabus-production.up.railway.app";

function LandingPage({ user, onNavigate }) {
  return (
    <div className="min-h-screen bg-ivory-50 flex flex-col">
      <Nav user={user} onNavigate={onNavigate} page="landing" />

      <main className="flex-1 flex flex-col items-center justify-center px-10 -mt-8">
        <div className="max-w-5xl w-full text-center">
          <h1 className="font-serif text-5xl sm:text-6xl font-bold text-ink-900 leading-[1.1] tracking-tight animate-fade-up-delay-1">
            Your syllabus,
            <br />
            on your calendar.
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-ink-500 leading-relaxed max-w-lg mx-auto animate-fade-up-delay-2">
            Upload a PDF or paste text. Every deadline, exam, and lecture lands
            on Google Calendar — automatically.
          </p>

          <div className="mt-10 animate-fade-up-delay-3">
            {user ? (
              <button
                onClick={() => onNavigate("dashboard")}
                className="inline-flex items-center gap-3 bg-ink-900 text-ivory-50 px-8 py-4 rounded-xl text-base font-medium
                           hover:bg-ink-800 active:scale-[0.98] transition-all duration-200
                           shadow-[0_2px_16px_rgba(0,0,0,0.12)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.18)]"
              >
                Go to your dashboard
              </button>
            ) : (
              <a
                href={`${API}/auth/login`}
                className="inline-flex items-center gap-3 bg-ink-900 text-ivory-50 px-8 py-4 rounded-xl text-base font-medium
                           hover:bg-ink-800 active:scale-[0.98] transition-all duration-200
                           shadow-[0_2px_16px_rgba(0,0,0,0.12)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.18)]"
              >
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.1 24.1 0 0 0 0 21.56l7.98-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                Sign in with Google
              </a>
            )}
          </div>

          <div className="mt-14 animate-fade-up-delay-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-left">
              <Step
                number="1"
                title="Upload or paste"
                description="Drop in a PDF or paste raw syllabus text — we extract every date, deadline, and schedule."
              />
              <Step
                number="2"
                title="Review &amp; check conflicts"
                description="Confirm what was found, then see if anything clashes with events already on your calendar."
              />
              <Step
                number="3"
                title="Pushed automatically"
                description="One click and every event lands on Google Calendar, tagged and organized."
              />
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full px-6 py-8 text-center">
        <p className="text-sm text-ink-400">
          Deadlined — built for syllabus week.
        </p>
      </footer>
    </div>
  );
}

function Step({ number, title, description }) {
  return (
    <div className="flex flex-col gap-3 p-5 rounded-2xl border border-ivory-300/60 bg-ivory-100/50">
      <div className="flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-ink-900 text-ivory-50 text-xs font-semibold flex items-center justify-center shrink-0">
          {number}
        </span>
        <h3
          className="font-semibold text-ink-900 text-[15px]"
          dangerouslySetInnerHTML={{ __html: title }}
        />
      </div>
      <p className="text-ink-500 text-sm leading-relaxed pl-10">{description}</p>
    </div>
  );
}

export default LandingPage;
