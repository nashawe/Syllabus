import { useState, useRef, useEffect } from "react";
import Nav from "./Nav";

const API =
  import.meta.env.VITE_API_URL || "https://syllabus-production.up.railway.app";

const CATEGORIES = [
  { key: "exam",     label: "Exams",    headerBg: "bg-red-50",    headerText: "text-red-700",   border: "border-red-200"   },
  { key: "homework", label: "Homework", headerBg: "bg-blue-50",   headerText: "text-blue-700",  border: "border-blue-200"  },
  { key: "project",  label: "Projects", headerBg: "bg-amber-50",  headerText: "text-amber-700", border: "border-amber-200" },
  { key: "lecture",  label: "Lectures", headerBg: "bg-stone-100", headerText: "text-stone-600", border: "border-stone-200" },
];

const THINKING_MESSAGES = [
  "Reading your syllabus...",
  "Identifying course structure...",
  "Extracting exam dates...",
  "Finding assignment deadlines...",
  "Expanding recurring events...",
  "Detecting office hours...",
  "Resolving ambiguous dates...",
  "Almost there...",
];

const PREVIEW_COUNT = 4;

export default function UploadPage({ onNavigate, user }) {
  const [stage, setStage]                   = useState("idle");
  const [inputMode, setInputMode]           = useState("pdf");
  const [pastedText, setPastedText]         = useState("");
  const [dragOver, setDragOver]             = useState(false);
  const [fileName, setFileName]             = useState("");
  const [apiDone, setApiDone]               = useState(false);
  const [pushProgress, setPushProgress]     = useState(0);
  const [pushedCount, setPushedCount]       = useState(0);
  const [showFound, setShowFound]           = useState(true);
  const [parsedData, setParsedData]         = useState(null);
  const [error, setError]                   = useState(null);
  const [checkedEvents, setCheckedEvents]   = useState({});
  const [expandedCats, setExpandedCats]     = useState({});
  const [reviewVisible, setReviewVisible]   = useState(false);
  const [conflictData, setConflictData]     = useState([]);
  const [conflictVisible, setConflictVisible] = useState(false);
  const [conflictChecking, setConflictChecking] = useState(false);
  const [skippedKeys, setSkippedKeys]       = useState(new Set());
  const [thinkingIndex, setThinkingIndex]   = useState(0);
  const [thinkingVisible, setThinkingVisible] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const fileInputRef        = useRef(null);
  const thinkingIntervalRef = useRef(null);
  const timerRef            = useRef(null);

  useEffect(() => {
    if (stage !== "processing") {
      clearInterval(thinkingIntervalRef.current);
      clearInterval(timerRef.current);
      return;
    }
    setThinkingIndex(0);
    setThinkingVisible(true);
    setElapsedSeconds(0);

    let idx = 0;
    thinkingIntervalRef.current = setInterval(() => {
      setThinkingVisible(false);
      setTimeout(() => {
        idx = Math.min(idx + 1, THINKING_MESSAGES.length - 1);
        setThinkingIndex(idx);
        setThinkingVisible(true);
      }, 400);
    }, 3500);

    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);

    return () => {
      clearInterval(thinkingIntervalRef.current);
      clearInterval(timerRef.current);
    };
  }, [stage]);

  useEffect(() => {
    if (apiDone) {
      setTimeout(() => {
        setStage("preview");
        setTimeout(() => setReviewVisible(true), 50);
      }, 400);
    }
  }, [apiDone]);

  // ── Parsing helpers ─────────────────────────────────────────────────────────

  const handleParsed = (data) => {
    setParsedData(data);
    setCheckedEvents(
      Object.fromEntries((data.events || []).map((e) => [e.title + e.date, true]))
    );
    setExpandedCats({});
    setApiDone(true);
  };

  const handleFile = async (file) => {
    if (!file || file.type !== "application/pdf") return;
    setFileName(file.name);
    setError(null);
    setApiDone(false);
    setReviewVisible(false);
    setStage("processing");

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/parse`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) throw new Error("Failed to parse syllabus");
      handleParsed(await res.json());
    } catch {
      setError("Something went wrong parsing your syllabus. Please try again.");
      setStage("idle");
    }
  };

  const handleTextParse = async () => {
    if (!pastedText.trim()) return;
    setFileName("Pasted text");
    setError(null);
    setApiDone(false);
    setReviewVisible(false);
    setStage("processing");

    try {
      const res = await fetch(`${API}/parse-text`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pastedText }),
      });
      if (!res.ok) throw new Error("Failed to parse syllabus");
      handleParsed(await res.json());
    } catch {
      setError("Something went wrong parsing your syllabus. Please try again.");
      setStage("idle");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  // ── Review helpers ───────────────────────────────────────────────────────────

  const toggleEvent  = (key) => setCheckedEvents((p) => ({ ...p, [key]: !p[key] }));
  const toggleExpand = (key) => setExpandedCats((p) => ({ ...p, [key]: !p[key] }));

  const confirmedEventsList = () =>
    (parsedData?.events || []).filter((e) => checkedEvents[e.title + e.date]);

  // ── ICS download ─────────────────────────────────────────────────────────────

  const handleDownloadICS = async () => {
    const evs = confirmedEventsList();
    if (evs.length === 0) return;
    try {
      const res = await fetch(`${API}/export/ics`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events:      evs,
          course_name: parsedData?.course_name || "",
          course_code: parsedData?.course_code || "",
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${(parsedData?.course_code || "deadlined").replace(/\s+/g, "_")}.ics`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* silently ignore ICS errors */
    }
  };

  // ── Confirm → conflict check → push ─────────────────────────────────────────

  const handleConfirm = async () => {
    if (!parsedData) return;
    const confirmedEvents = confirmedEventsList();
    setConflictChecking(true);

    try {
      const res = await fetch(`${API}/conflicts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events:         confirmedEvents,
          semester_start: parsedData.semester_start,
          semester_end:   parsedData.semester_end,
          course_code:    parsedData.course_code,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.conflicts?.length > 0) {
          setConflictData(data.conflicts);
          setSkippedKeys(new Set());
          setConflictChecking(false);
          setStage("conflict");
          setTimeout(() => setConflictVisible(true), 50);
          return;
        }
      }
    } catch {
      /* if conflict check fails, proceed to push */
    }

    setConflictChecking(false);
    handlePush(confirmedEvents);
  };

  const handlePushFromConflict = () => {
    const final = confirmedEventsList().filter(
      (e) => !skippedKeys.has(e.title + e.date)
    );
    handlePush(final);
  };

  const handlePush = async (eventsToUse) => {
    setStage("pushing");
    setPushProgress(0);
    setPushedCount(0);

    const total = eventsToUse.length;
    let count   = 0;
    const iv    = setInterval(() => {
      count++;
      setPushedCount(count);
      setPushProgress(Math.round((count / total) * 100));
      if (count >= total) clearInterval(iv);
    }, 150);

    try {
      const res = await fetch(`${API}/push`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsedData, events: eventsToUse }),
      });

      clearInterval(iv);
      setPushProgress(100);
      setPushedCount(total);

      if (!res.ok) {
        const err = await res.json();
        setError(
          err.detail === "Course already uploaded"
            ? "This course has already been uploaded. Delete it from your dashboard first."
            : "Failed to push events to Google Calendar."
        );
        setStage("preview");
        return;
      }

      setTimeout(() => {
        setStage("done");
        setTimeout(() => onNavigate("dashboard"), 1500);
      }, 400);
    } catch {
      clearInterval(iv);
      setError("Failed to push events. Please try again.");
      setStage("preview");
    }
  };

  // ── Derived values ───────────────────────────────────────────────────────────

  const events        = parsedData?.events || [];
  const omissions     = parsedData?.omissions || [];
  const selectedCount = Object.values(checkedEvents).filter(Boolean).length;
  const hasLowConf    = events.some((e) => e.confidence === "low");
  const isReviewing   = stage === "preview" || stage === "pushing" || stage === "done";
  const resolvedCount = confirmedEventsList().filter(
    (e) => !skippedKeys.has(e.title + e.date)
  ).length;

  const formatElapsed = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

  // ── Toggle skip for conflict cards ──────────────────────────────────────────

  const setSkip = (key, skip) =>
    setSkippedKeys((prev) => {
      const next = new Set(prev);
      skip ? next.add(key) : next.delete(key);
      return next;
    });

  return (
    <div className="h-screen overflow-hidden bg-ivory-50 flex flex-col">
      <Nav user={user} onNavigate={onNavigate} page="upload" />

      <main className="flex-1 min-h-0 flex flex-col px-10 pb-8 max-w-6xl mx-auto w-full">

        {/* ── Idle ── */}
        {stage === "idle" && (
          <div className="flex-1 flex flex-col gap-3">
            {/* Input mode toggle */}
            <div className="shrink-0 flex items-center gap-1 pt-4 p-1 bg-ivory-200 rounded-xl w-fit">
              <button
                onClick={() => setInputMode("pdf")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  inputMode === "pdf"
                    ? "bg-ink-900 text-ivory-50 shadow-sm"
                    : "text-ink-500 hover:text-ink-700"
                }`}
              >
                PDF Upload
              </button>
              <button
                onClick={() => setInputMode("text")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  inputMode === "text"
                    ? "bg-ink-900 text-ivory-50 shadow-sm"
                    : "text-ink-500 hover:text-ink-700"
                }`}
              >
                Paste Text
              </button>
            </div>

            {/* PDF drop zone */}
            {inputMode === "pdf" && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  flex-1 rounded-2xl border-2 border-dashed cursor-pointer
                  flex flex-col items-center justify-center px-8 gap-4
                  transition-all duration-200
                  ${dragOver
                    ? "border-ink-600 bg-ivory-200"
                    : "border-ivory-300 bg-ivory-100/60 hover:border-ink-400 hover:bg-ivory-100"}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                <div className="w-14 h-14 rounded-2xl bg-ink-900 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <polyline points="9,15 12,12 15,15" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="font-serif text-2xl font-bold text-ink-900 mb-1">
                    Drop your syllabus here
                  </p>
                  <p className="text-ink-400 text-sm">PDF only · or click to browse</p>
                </div>
                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              </div>
            )}

            {/* Text paste zone */}
            {inputMode === "text" && (
              <div className="flex-1 flex flex-col gap-3">
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste your syllabus text here..."
                  className="flex-1 rounded-2xl border-2 border-ivory-300 bg-ivory-100/60 p-6
                             text-ink-800 text-sm leading-relaxed resize-none
                             focus:outline-none focus:border-ink-400 transition-colors duration-200
                             placeholder:text-ink-300"
                />
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  onClick={handleTextParse}
                  disabled={!pastedText.trim()}
                  className="shrink-0 py-4 rounded-xl bg-ink-900 text-ivory-50 font-medium text-base
                             hover:bg-ink-800 active:scale-[0.99] transition-all duration-150
                             disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Parse syllabus
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Processing ── */}
        {stage === "processing" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-0">
            <div className="relative flex items-center justify-center mb-10">
              <div className="absolute rounded-full bg-ink-900/5" style={{ width: 120, height: 120, animation: "ping-slow 2.4s cubic-bezier(0,0,0.2,1) infinite" }} />
              <div className="absolute rounded-full bg-ink-900/8" style={{ width: 90, height: 90, animation: "ping-slow 2.4s cubic-bezier(0,0,0.2,1) infinite 0.3s" }} />
              <div className="relative w-16 h-16 rounded-2xl bg-ink-900 flex items-center justify-center shadow-lg" style={{ animation: "float 3s ease-in-out infinite" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="13" y2="17" />
                </svg>
              </div>
            </div>

            <p className="text-ink-400 text-xs font-mono mb-3 tracking-wide">{fileName}</p>
            <h2 className="font-serif text-3xl font-bold text-ink-900 mb-2 text-center">
              Parsing your syllabus
            </h2>
            <p className="text-ink-400 text-sm mb-8 text-center">
              AI is reading and extracting every event — this typically takes 20–40 seconds
            </p>

            <div className="h-6 flex items-center justify-center mb-8">
              <p
                className="text-ink-500 text-sm font-medium"
                style={{
                  opacity:   thinkingVisible ? 1 : 0,
                  transform: thinkingVisible ? "translateY(0)" : "translateY(4px)",
                  transition: "opacity 0.4s ease, transform 0.4s ease",
                }}
              >
                {THINKING_MESSAGES[thinkingIndex]}
              </p>
            </div>

            <div className="w-80 h-0.5 bg-ivory-300 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-ink-700 rounded-full" style={{ animation: "indeterminate 2s ease-in-out infinite", width: "40%" }} />
            </div>
            <p className="text-ink-300 text-xs font-mono tabular-nums">{formatElapsed(elapsedSeconds)}</p>

            <style>{`
              @keyframes ping-slow {
                0% { transform: scale(0.95); opacity: 0.6; }
                70%, 100% { transform: scale(1.3); opacity: 0; }
              }
              @keyframes float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-5px); }
              }
              @keyframes indeterminate {
                0% { transform: translateX(-100%) scaleX(1); }
                40% { transform: translateX(0%) scaleX(1.5); }
                100% { transform: translateX(350%) scaleX(1); }
              }
            `}</style>
          </div>
        )}

        {/* ── Review (preview / pushing / done) ── */}
        {isReviewing && (
          <div
            className="flex-1 min-h-0 flex flex-col transition-all duration-500"
            style={{
              opacity:   reviewVisible ? 1 : 0,
              transform: reviewVisible ? "translateY(0)" : "translateY(16px)",
            }}
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between mt-2 mb-4">
              <div>
                <h3 className="font-serif text-2xl font-bold text-ink-900">Review events</h3>
                <p className="text-ink-500 text-sm mt-0.5">
                  Found{" "}
                  <span className="text-ink-800 font-medium">{events.length} events</span>
                  {" "}in{" "}
                  <span className="text-ink-800 font-medium">{fileName}</span>
                </p>
              </div>
              {stage === "preview" && (
                <p className="text-sm text-ink-400">{selectedCount} selected</p>
              )}
            </div>

            {error && (
              <div className="shrink-0 mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Card with toggle + grid */}
            <div className="flex-1 min-h-0 rounded-2xl border border-ivory-300 bg-ivory-100/40 p-5 flex flex-col mb-4">
              {/* Found / Not found toggle */}
              <div className="shrink-0 flex items-center gap-1 mb-4 p-1 bg-ivory-200 rounded-xl w-fit">
                <button
                  onClick={() => setShowFound(true)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${showFound ? "bg-ink-900 text-ivory-50 shadow-sm" : "text-ink-500 hover:text-ink-700"}`}
                >
                  Found ({events.length})
                </button>
                <button
                  onClick={() => setShowFound(false)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${!showFound ? "bg-ink-900 text-ivory-50 shadow-sm" : "text-ink-500 hover:text-ink-700"}`}
                >
                  Not found ({omissions.length})
                </button>
              </div>

              {showFound && hasLowConf && (
                <div className="shrink-0 mb-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p className="text-amber-700 text-sm">
                    Some events are marked{" "}
                    <span className="font-medium">low confidence</span> — review before confirming.
                  </p>
                </div>
              )}

              {!showFound && (
                <div className="shrink-0 mb-3 px-4 py-2.5 rounded-xl bg-ivory-200 border border-ivory-300 flex items-center gap-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-ink-500 text-sm">
                    These items weren&apos;t detected. Add them manually in Google Calendar.
                  </p>
                </div>
              )}

              {/* Category grid */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                  {CATEGORIES.map((cat) => {
                    const items = showFound
                      ? events.filter((e) => e.type === cat.key)
                      : omissions.filter((o) => o.type === cat.key);
                    if (items.length === 0) return null;
                    const expanded = !!expandedCats[cat.key];
                    const visible  = expanded ? items : items.slice(0, PREVIEW_COUNT);
                    const hasMore  = items.length > PREVIEW_COUNT;

                    return (
                      <div key={cat.key} className={`rounded-xl border ${cat.border} overflow-hidden h-fit`}>
                        <div className={`px-4 py-2.5 ${cat.headerBg} border-b ${cat.border} flex items-center justify-between`}>
                          <span className={`text-xs font-semibold uppercase tracking-wider ${cat.headerText}`}>{cat.label}</span>
                          <span className={`text-xs font-medium ${cat.headerText} opacity-60`}>{items.length}</span>
                        </div>

                        <div className="divide-y divide-ivory-200 bg-white">
                          {visible.map((item) => {
                            if (!showFound) return (
                              <div key={item.title + (item.reason || "")} className="px-4 py-3">
                                <p className="text-ink-700 font-medium text-xs leading-snug">{item.title}</p>
                                <p className="text-ink-400 text-[11px] mt-0.5">{item.reason}</p>
                              </div>
                            );
                            const key     = item.title + item.date;
                            const checked = checkedEvents[key] ?? true;
                            return (
                              <div
                                key={key}
                                onClick={() => stage === "preview" && toggleEvent(key)}
                                className={`px-4 py-3 flex items-start gap-3 transition-all duration-150 ${
                                  stage === "preview" ? "cursor-pointer hover:bg-ivory-50" : "cursor-default"
                                } ${!checked ? "opacity-30" : ""}`}
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-all ${checked ? "bg-ink-900 border-ink-900" : "bg-white border-ink-300"}`}>
                                  {checked && (
                                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-ink-900 font-medium text-xs leading-snug">{item.title}</p>
                                    {item.confidence === "low" && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 font-medium leading-none shrink-0">low</span>
                                    )}
                                  </div>
                                  <p className="text-ink-400 text-[11px] mt-0.5">{item.date}</p>
                                  <p className="text-ink-300 text-[11px]">{item.time}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {hasMore && (
                          <button
                            onClick={() => toggleExpand(cat.key)}
                            className={`w-full px-4 py-2 text-[11px] font-medium border-t ${cat.border} ${cat.headerBg} ${cat.headerText} hover:opacity-80 transition-opacity`}
                          >
                            {expanded ? "Show less" : `+${items.length - PREVIEW_COUNT} more`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Confirm row — ICS + push */}
            {stage === "preview" && (
              <div className="shrink-0 flex gap-3">
                <button
                  onClick={handleDownloadICS}
                  disabled={selectedCount === 0}
                  className="flex items-center gap-2 px-5 py-4 rounded-xl border border-ivory-300 bg-white text-ink-700 font-medium text-sm
                             hover:bg-ivory-100 active:scale-[0.99] transition-all duration-150
                             disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7,10 12,15 17,10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download .ics
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedCount === 0 || conflictChecking}
                  className="flex-1 py-4 rounded-xl bg-ink-900 text-ivory-50 font-medium text-base
                             hover:bg-ink-800 active:scale-[0.99] transition-all duration-150
                             disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {conflictChecking
                    ? "Checking for conflicts..."
                    : `Add ${selectedCount} event${selectedCount !== 1 ? "s" : ""} to Google Calendar`}
                </button>
              </div>
            )}

            {/* Pushing / done */}
            {(stage === "pushing" || stage === "done") && (
              <div className="shrink-0 rounded-xl border border-ivory-300 bg-ivory-100/60 px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-ink-800 font-medium text-sm">
                    {stage === "done" ? "All events added" : "Adding to Google Calendar..."}
                  </p>
                  <p className="text-ink-400 text-sm font-mono">{pushedCount} / {selectedCount}</p>
                </div>
                <div className="h-1.5 w-full bg-ivory-300 rounded-full overflow-hidden">
                  <div className="h-full bg-ink-800 rounded-full transition-all duration-200" style={{ width: `${pushProgress}%` }} />
                </div>
                {stage === "done" && (
                  <div className="mt-4 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-ink-900 flex items-center justify-center shrink-0">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <p className="text-ink-700 text-sm font-medium">Done. Redirecting to your dashboard...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Conflict stage ── */}
        {stage === "conflict" && (
          <div
            className="flex-1 min-h-0 flex flex-col transition-all duration-500"
            style={{
              opacity:   conflictVisible ? 1 : 0,
              transform: conflictVisible ? "translateY(0)" : "translateY(16px)",
            }}
          >
            {/* Header */}
            <div className="shrink-0 mt-2 mb-4">
              <h3 className="font-serif text-2xl font-bold text-ink-900">Conflict check</h3>
              <p className="text-ink-500 text-sm mt-0.5">Review scheduling conflicts before pushing to your calendar</p>
            </div>

            {/* Amber banner */}
            <div className="shrink-0 mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-amber-700 text-sm font-medium">
                {conflictData.length} conflict{conflictData.length !== 1 ? "s" : ""} found — review before continuing
              </p>
            </div>

            {/* Conflict cards */}
            <div className="flex-1 min-h-0 overflow-y-auto mb-4">
              <div className="space-y-3 pb-1">
                {conflictData.map((conflict, i) => {
                  const key     = conflict.event_a.title + conflict.event_a.date;
                  const skipped = skippedKeys.has(key);
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border border-amber-200 bg-amber-50/40 p-4 transition-opacity duration-200 ${skipped ? "opacity-40" : ""}`}
                    >
                      <p className="text-ink-700 text-sm mb-3 leading-relaxed">{conflict.ai_summary}</p>
                      <div className="flex items-stretch gap-3 mb-3">
                        <div className="flex-1 rounded-lg bg-white border border-amber-200 px-3 py-2.5">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-1">New event</p>
                          <p className="text-ink-800 text-xs font-medium leading-snug">{conflict.event_a.title}</p>
                          <p className="text-ink-400 text-[11px] mt-0.5">{conflict.event_a.date}</p>
                        </div>
                        <div className="flex items-center justify-center w-6 shrink-0 text-amber-300 text-base">↔</div>
                        <div className="flex-1 rounded-lg bg-white border border-ivory-300 px-3 py-2.5">
                          <p className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-1">Existing</p>
                          <p className="text-ink-800 text-xs font-medium leading-snug">{conflict.event_b.title}</p>
                          <p className="text-ink-400 text-[11px] mt-0.5">{conflict.event_b.date}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSkip(key, true)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                            skipped
                              ? "bg-ink-900 text-ivory-50"
                              : "border border-ivory-300 text-ink-600 hover:bg-ivory-100"
                          }`}
                        >
                          Skip this event
                        </button>
                        <button
                          onClick={() => setSkip(key, false)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                            !skipped
                              ? "bg-ink-900 text-ivory-50"
                              : "border border-ivory-300 text-ink-600 hover:bg-ivory-100"
                          }`}
                        >
                          Add anyway
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom buttons */}
            <div className="shrink-0 flex gap-3">
              <button
                onClick={handleDownloadICS}
                className="flex items-center gap-2 px-5 py-4 rounded-xl border border-ivory-300 bg-white text-ink-700 font-medium text-sm
                           hover:bg-ivory-100 active:scale-[0.99] transition-all duration-150"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7,10 12,15 17,10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download .ics
              </button>
              <button
                onClick={handlePushFromConflict}
                className="flex-1 py-4 rounded-xl bg-ink-900 text-ivory-50 font-medium text-base
                           hover:bg-ink-800 active:scale-[0.99] transition-all duration-150"
              >
                Continue to Calendar ({resolvedCount} event{resolvedCount !== 1 ? "s" : ""})
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
