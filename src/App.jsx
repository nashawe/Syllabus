import { useState, useEffect } from "react";
import LandingPage from "./LandingPage";
import UploadPage from "./UploadPage";
import Dashboard from "./Dashboard";

const API =
  import.meta.env.VITE_API_URL || "https://syllabus-production.up.railway.app";

function App() {
  const [page, setPage] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setUser(data);
        setPage("landing");
      })
      .catch(() => setPage("landing"));
  }, []);

  if (page === null)
    return (
      <div className="h-screen bg-ivory-50 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-ink-300 border-t-ink-800 animate-spin" />
      </div>
    );

  if (page === "landing")
    return <LandingPage user={user} onNavigate={setPage} />;
  if (page === "upload") return <UploadPage user={user} onNavigate={setPage} />;
  if (page === "dashboard")
    return <Dashboard user={user} onNavigate={setPage} />;

  return null;
}

export default App;
