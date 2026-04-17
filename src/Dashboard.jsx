import { useState, useEffect, useRef } from "react";
import Nav from "./Nav";

const API =
  import.meta.env.VITE_API_URL || "https://syllabus-production.up.railway.app";

const TYPE_COLORS = {
  exam:     { bg: "bg-red-50",    text: "text-red-700",   border: "border-red-200"   },
  homework: { bg: "bg-blue-50",   text: "text-blue-700",  border: "border-blue-200"  },
  project:  { bg: "bg-amber-50",  text: "text-amber-700", border: "border-amber-200" },
  lecture:  { bg: "bg-stone-100", text: "text-stone-600", border: "border-stone-200" },
};

const TYPE_LABELS = { exam: "Exam", homework: "Homework", project: "Project", lecture: "Lecture" };

function totalEvents(course) {
  return Object.values(course.events).reduce((a, b) => a + b, 0);
}

function semesterProgress(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (now <= s) return 0;
  if (now >= e) return 100;
  return Math.round(((now - s) / (e - s)) * 100);
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-ivory-300 bg-white p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-3 w-20 bg-ivory-300 rounded" />
        <div className="h-3 w-16 bg-ivory-200 rounded" />
      </div>
      <div className="h-4 w-full bg-ivory-200 rounded mb-1.5" />
      <div className="h-4 w-2/3 bg-ivory-200 rounded mb-5" />
      <div className="grid grid-cols-2 gap-1.5 mb-4">
        <div className="h-8 bg-ivory-100 rounded-lg" />
        <div className="h-8 bg-ivory-100 rounded-lg" />
        <div className="col-span-2 h-8 bg-ivory-100 rounded-lg" />
      </div>
      <div className="h-14 bg-ivory-50 rounded-xl" />
    </div>
  );
}

// ── Stress map ────────────────────────────────────────────────────────────────

function getMonday(dateStr) {
  const d   = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function weekColor(count) {
  if (count === 0) return "bg-ivory-200";
  if (count <= 2) return "bg-amber-100";
  if (count <= 4) return "bg-amber-300";
  return "bg-red-300";
}

function StressMap({ courses }) {
  const [tooltip, setTooltip] = useState(null);
  const tooltipRef = useRef(null);

  const allEvents = courses.flatMap((c) =>
    (c.allEvents || [])
      .filter((e) => e.type !== "lecture")
      .map((e) => ({ ...e, courseCode: c.code }))
  );

  const semDates = courses.flatMap((c) => [c.semesterStart, c.semesterEnd]).filter(Boolean);
  if (semDates.length < 2 || allEvents.length === 0) return null;

  const minDate = semDates.reduce((a, b) => (a < b ? a : b));
  const maxDate = semDates.reduce((a, b) => (a > b ? a : b));

  // Build weeks array
  const weeks = [];
  let curr = getMonday(minDate);
  while (curr <= maxDate) {
    const wStart = curr;
    const wEnd   = addDays(curr, 6);
    const wEvs   = allEvents.filter((e) => e.date >= wStart && e.date <= wEnd);
    weeks.push({ start: wStart, end: wEnd, events: wEvs });
    curr = addDays(curr, 7);
  }

  // Determine month label for each week (show when month changes)
  const getMonthLabel = (i) => {
    const thisMonth = weeks[i].start.substring(0, 7);
    const prevMonth = i > 0 ? weeks[i - 1].start.substring(0, 7) : null;
    if (thisMonth !== prevMonth) {
      const d = new Date(weeks[i].start + "T12:00:00");
      return d.toLocaleString("default", { month: "short" });
    }
    return null;
  };

  return (
    <div className="mt-8 shrink-0">
      <h3 className="font-serif text-xl font-bold text-ink-900 mb-3">Semester Overview</h3>
      <div className="rounded-2xl border border-ivory-300 bg-white p-5">
        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-max pb-1">
            {weeks.map((week, i) => {
              const label = getMonthLabel(i);
              const count = week.events.length;
              return (
                <div key={week.start} className="flex flex-col items-center gap-1">
                  <span className={`text-[10px] font-medium text-ink-400 h-3 leading-none ${label ? "visible" : "invisible"}`}>
                    {label || "x"}
                  </span>
                  <div
                    className={`w-5 h-5 rounded-sm cursor-default transition-colors duration-150 ${weekColor(count)} ${count > 0 ? "hover:ring-1 hover:ring-ink-300" : ""}`}
                    onMouseEnter={(e) => {
                      if (count > 0) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ week, x: rect.left + rect.width / 2, y: rect.top });
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <span className="text-[11px] text-ink-400">Deadlines per week:</span>
          {[
            { color: "bg-ivory-200", label: "0" },
            { color: "bg-amber-100", label: "1–2" },
            { color: "bg-amber-300", label: "3–4" },
            { color: "bg-red-300",   label: "5+" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-3.5 h-3.5 rounded-sm ${color}`} />
              <span className="text-[10px] text-ink-400">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-ink-900 text-ivory-50 rounded-xl px-3 py-2.5 text-xs shadow-xl pointer-events-none max-w-[240px]"
          style={{
            left:      tooltip.x,
            top:       tooltip.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <p className="font-semibold mb-1.5 text-ivory-200">
            Week of {tooltip.week.start}
          </p>
          {tooltip.week.events.map((e, i) => (
            <p key={i} className="leading-snug">
              {e.title}
              <span className="text-ivory-400 ml-1">({e.courseCode})</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Slide-out panel ───────────────────────────────────────────────────────────

function CoursePanel({ course, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Mount → animate in
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const allEvsByType = {};
  for (const cat of ["exam", "homework", "project", "lecture"]) {
    const evs = (course.allEvents || []).filter((e) => e.type === cat);
    if (evs.length > 0) allEvsByType[cat] = evs;
  }

  const CAT_LABELS = { exam: "Exams", homework: "Homework", project: "Projects", lecture: "Lectures" };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink-900/20 z-40 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={close}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-white shadow-xl z-50 flex flex-col transition-transform duration-300"
        style={{ transform: visible ? "translateX(0)" : "translateX(100%)" }}
      >
        {/* Panel header */}
        <div className="shrink-0 px-6 py-5 border-b border-ivory-200 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider mb-1">{course.code} · {course.term}</p>
            <h2 className="font-serif text-xl font-bold text-ink-900 leading-snug">{course.name}</h2>
          </div>
          <button
            onClick={close}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ivory-100 transition-colors mt-0.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Professor info */}
          {(course.professor || course.officeHours || course.location) && (
            <section>
              <h4 className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider mb-3">Instructor</h4>
              <div className="space-y-1.5">
                {course.professor && (
                  <p className="text-ink-800 text-sm font-medium">{course.professor}</p>
                )}
                {course.professorEmail && (
                  <a
                    href={`mailto:${course.professorEmail}`}
                    className="text-ink-500 text-sm hover:text-ink-800 transition-colors block"
                  >
                    {course.professorEmail}
                  </a>
                )}
                {course.officeHours && (
                  <p className="text-ink-500 text-sm">
                    <span className="font-medium text-ink-700">Office hours:</span> {course.officeHours}
                  </p>
                )}
                {course.location && (
                  <p className="text-ink-500 text-sm">
                    <span className="font-medium text-ink-700">Location:</span> {course.location}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Description */}
          {course.description && (
            <section>
              <h4 className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider mb-3">About</h4>
              <p className="text-ink-600 text-sm leading-relaxed">{course.description}</p>
            </section>
          )}

          {/* Grading breakdown */}
          {course.gradingBreakdown?.length > 0 && (
            <section>
              <h4 className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider mb-3">Grading</h4>
              <div className="rounded-xl border border-ivory-300 overflow-hidden">
                {course.gradingBreakdown.map((row, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-4 py-2.5 ${i < course.gradingBreakdown.length - 1 ? "border-b border-ivory-200" : ""} ${i % 2 === 0 ? "bg-white" : "bg-ivory-50/60"}`}
                  >
                    <span className="text-ink-700 text-sm">{row.component}</span>
                    <span className="text-ink-500 text-sm font-medium">{row.weight}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Required texts */}
          {course.requiredTexts?.length > 0 && (
            <section>
              <h4 className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider mb-3">Required Texts</h4>
              <ul className="space-y-1.5">
                {course.requiredTexts.map((text, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink-600">
                    <span className="text-ink-300 mt-0.5 shrink-0">—</span>
                    <span className="leading-snug">{text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* All events by type */}
          {Object.keys(allEvsByType).length > 0 && (
            <section>
              <h4 className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider mb-3">All Events</h4>
              <div className="space-y-3">
                {Object.entries(allEvsByType).map(([type, evs]) => {
                  const c = TYPE_COLORS[type];
                  return (
                    <div key={type} className={`rounded-xl border ${c.border} overflow-hidden`}>
                      <div className={`px-4 py-2 ${c.bg} border-b ${c.border} flex items-center justify-between`}>
                        <span className={`text-xs font-semibold uppercase tracking-wider ${c.text}`}>{CAT_LABELS[type]}</span>
                        <span className={`text-xs font-medium ${c.text} opacity-60`}>{evs.length}</span>
                      </div>
                      <div className="divide-y divide-ivory-200 bg-white max-h-48 overflow-y-auto">
                        {evs.map((ev, i) => (
                          <div key={i} className="px-4 py-2.5">
                            <p className="text-ink-800 text-xs font-medium leading-snug">{ev.title}</p>
                            <p className="text-ink-400 text-[11px] mt-0.5">
                              {ev.date}{ev.time ? ` · ${ev.time}` : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard({ onNavigate, user }) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [courses, setCourses]             = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);

  useEffect(() => {
    fetch(`${API}/courses`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { setCourses(data); setLoadingCourses(false); })
      .catch(() => setLoadingCourses(false));
  }, []);

  const isEmpty = !loadingCourses && courses.length === 0;

  const handleDelete = async (id) => {
    await fetch(`${API}/courses/${id}`, { method: "DELETE", credentials: "include" });
    setCourses((prev) => prev.filter((c) => c.id !== id));
    setConfirmDelete(null);
  };

  return (
    <div className="h-screen overflow-hidden bg-ivory-50 flex flex-col">
      <Nav user={user} onNavigate={onNavigate} page="dashboard" />
      <div className="shrink-0 h-px bg-ivory-300 w-full" />

      <main className="flex-1 min-h-0 overflow-y-auto flex flex-col px-10 pb-8 max-w-6xl mx-auto w-full">
        {/* Page header */}
        <div className="shrink-0 flex items-center justify-between mt-8 mb-6">
          <div>
            <h2 className="font-serif text-3xl font-bold text-ink-900 leading-tight">
              {isEmpty ? "Get started" : loadingCourses ? "Your courses" : "Your courses"}
            </h2>
            <p className="text-ink-500 text-sm mt-1">
              {isEmpty
                ? "Upload your first syllabus to get started."
                : loadingCourses
                ? "Loading your courses..."
                : `${courses.length} course${courses.length !== 1 ? "s" : ""} · Spring 2026`}
            </p>
          </div>
          {!isEmpty && !loadingCourses && (
            <button
              onClick={() => onNavigate("upload")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ink-900 text-ivory-50
                         text-sm font-medium hover:bg-ink-800 active:scale-[0.98] transition-all duration-150"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add course
            </button>
          )}
        </div>

        {/* Skeleton loaders */}
        {loadingCourses && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-ivory-200 border border-ivory-300 flex items-center justify-center mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B0B0B0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9,15 12,12 15,15" />
              </svg>
            </div>
            <p className="text-ink-800 font-medium text-base mb-1">No courses yet</p>
            <p className="text-ink-400 text-sm mb-7 text-center max-w-xs">
              Upload a syllabus PDF and every deadline lands in your Google Calendar automatically.
            </p>
            <button
              onClick={() => onNavigate("upload")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-ink-900 text-ivory-50
                         text-sm font-medium hover:bg-ink-800 active:scale-[0.98] transition-all duration-150"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Upload your first syllabus
            </button>
          </div>
        )}

        {/* Course grid */}
        {!loadingCourses && !isEmpty && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {courses.map((course) => {
                const next     = course.nextEvent;
                const total    = totalEvents(course);
                const progress = semesterProgress(course.semesterStart, course.semesterEnd);

                return (
                  <div
                    key={course.id}
                    onClick={() => setSelectedCourse(course)}
                    className="rounded-2xl border border-ivory-300 bg-white flex flex-col overflow-hidden cursor-pointer
                               hover:border-ivory-400 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-200"
                  >
                    <div className="px-5 pt-5 pb-4 flex-1">
                      {/* Course meta */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className="text-[11px] font-semibold text-ink-400 tracking-wider uppercase">{course.code}</span>
                        <span className="text-[11px] text-ink-300 shrink-0">{course.term}</span>
                      </div>
                      <h3 className="font-serif text-base font-bold text-ink-900 leading-snug mb-4">
                        {course.name}
                      </h3>

                      {/* Event breakdown */}
                      <div className="grid grid-cols-2 gap-1.5 mb-4">
                        {Object.entries(course.events).map(([type, count]) => {
                          if (count === 0 || type === "lecture") return null;
                          const c = TYPE_COLORS[type];
                          return (
                            <div key={type} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${c.bg} ${c.border}`}>
                              <span className={`text-[11px] font-medium ${c.text}`}>{TYPE_LABELS[type]}</span>
                              <span className={`text-[11px] font-semibold ${c.text}`}>{count}</span>
                            </div>
                          );
                        })}
                        {course.events.lecture > 0 && (
                          <div className="col-span-2 flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50">
                            <span className="text-[11px] font-medium text-stone-500">Lectures</span>
                            <span className="text-[11px] font-semibold text-stone-500">{course.events.lecture}</span>
                          </div>
                        )}
                      </div>

                      {/* Next deliverable */}
                      {next && (
                        <div className="rounded-xl border border-ivory-300 bg-ivory-50 px-3 py-2.5">
                          <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1">Next up</p>
                          <p className="text-ink-800 text-xs font-medium leading-snug">{next.title}</p>
                          <p className="text-ink-400 text-[11px] mt-0.5">{next.date}</p>
                        </div>
                      )}
                    </div>

                    {/* Semester progress bar */}
                    <div className="px-5 pt-3 pb-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-ink-300 uppercase tracking-wider font-semibold">Semester progress</span>
                        <span className="text-[10px] text-ink-400 font-medium">{progress}%</span>
                      </div>
                      <div className="h-1 w-full bg-ivory-300 rounded-full overflow-hidden">
                        <div className="h-full bg-ink-700 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    {/* Card footer */}
                    <div className="px-5 py-3 mt-2 border-t border-ivory-200 flex items-center justify-between bg-ivory-50/60">
                      <p className="text-ink-400 text-[11px]">{total} events · Added {course.uploadedAt}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(course.id); }}
                        className="text-ink-300 hover:text-red-400 transition-colors duration-150 p-1 rounded-lg hover:bg-red-50"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3,6 5,6 21,6" />
                          <path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6" />
                          <path d="M10,11v6" />
                          <path d="M14,11v6" />
                          <path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1V6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stress map */}
            <StressMap courses={courses} />
          </>
        )}
      </main>

      {/* Slide-out panel */}
      {selectedCourse && (
        <CoursePanel course={selectedCourse} onClose={() => setSelectedCourse(null)} />
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-ink-900/30 flex items-center justify-center z-50 px-6"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-white rounded-2xl border border-ivory-300 p-6 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-serif text-lg font-bold text-ink-900 mb-2">Remove this course?</h4>
            <p className="text-ink-500 text-sm mb-6 leading-relaxed">
              This will remove the course from your dashboard. Events already in your Google Calendar will not be affected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-ivory-300 text-ink-600 text-sm font-medium hover:bg-ivory-100 transition-all duration-150"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 active:scale-[0.98] transition-all duration-150"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
