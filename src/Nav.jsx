const API =
  import.meta.env.VITE_API_URL || "https://syllabus-production.up.railway.app";

export default function Nav({ user, onNavigate, page }) {
  const handleLogout = async () => {
    await fetch(`${API}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    window.location.reload();
  };

  const avatarInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <nav className="shrink-0 w-full px-10 py-4 max-w-6xl mx-auto flex items-center justify-between">
      {/* Logo */}
      <button
        onClick={() => onNavigate("landing")}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <div className="w-8 h-8 rounded-lg bg-ink-900 flex items-center justify-center">
          <span className="text-ivory-50 font-serif font-bold text-sm leading-none">
            D
          </span>
        </div>
        <span className="text-ink-900 font-semibold text-lg tracking-tight">
          Deadlined
        </span>
      </button>

      {/* Right side */}
      <div className="flex items-center gap-6">
        {user ? (
          <>
            <button
              onClick={() => onNavigate("dashboard")}
              className={`text-sm font-medium transition-colors duration-150 ${
                page === "dashboard"
                  ? "text-ink-900"
                  : "text-ink-400 hover:text-ink-700"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => onNavigate("upload")}
              className={`text-sm font-medium transition-colors duration-150 ${
                page === "upload"
                  ? "text-ink-900"
                  : "text-ink-400 hover:text-ink-700"
              }`}
            >
              Upload
            </button>

            {/* Avatar dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-ink-900 flex items-center justify-center">
                  <span className="text-ivory-50 text-xs font-semibold">
                    {avatarInitials}
                  </span>
                </div>
              </button>

              <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-ivory-300 bg-white shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                <div className="px-4 py-3 border-b border-ivory-200">
                  <p className="text-ink-800 text-sm font-medium leading-none">
                    {user.name}
                  </p>
                  <p className="text-ink-400 text-xs mt-1 truncate">
                    {user.email}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2.5 text-left text-sm text-ink-500 hover:text-ink-800 hover:bg-ivory-50 transition-colors rounded-b-xl"
                >
                  Sign out
                </button>
              </div>
            </div>
          </>
        ) : (
          <a
            href={`${API}/auth/login`}
            className="text-sm font-medium text-ink-500 hover:text-ink-800 transition-colors"
          >
            Sign in
          </a>
        )}
      </div>
    </nav>
  );
}
