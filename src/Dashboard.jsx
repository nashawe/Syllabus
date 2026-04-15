import { useState, useEffect } from "react";
import Nav from "./Nav";

const API = "http://localhost:8000";

const DUMMY_USER = {
  name: "Nate Shawe",
  email: "nshawe@wisc.edu",
  avatar: "NS",
};

const DUMMY_COURSES = [
  {
    id: "math222_s26",
    name: "Calculus & Analytic Geometry 2",
    code: "MATH 222",
    term: "Spring 2026",
    uploadedAt: "Jan 21, 2026",
    semesterStart: "2026-01-20",
    semesterEnd: "2026-05-01",
    events: { exam: 3, homework: 8, project: 0, lecture: 32 },
    nextEvent: { title: "Midterm 2", date: "Mar 18, 2026", type: "exam" },
  },
  {
    id: "cs300_s26",
    name: "Programming II",
    code: "COMP SCI 300",
    term: "Spring 2026",
    uploadedAt: "Jan 21, 2026",
    semesterStart: "2026-01-20",
    semesterEnd: "2026-05-01",
    events: { exam: 2, homework: 11, project: 3, lecture: 28 },
    nextEvent: {
      title: "Project 3 Due",
      date: "Mar 22, 2026",
      type: "project",
    },
  },
  {
    id: "afro154_s26",
    name: "Hip-Hop and Contemporary American Society",
    code: "AFROAMER 154",
    term: "Spring 2026",
    uploadedAt: "Jan 22, 2026",
    semesterStart: "2026-01-20",
    semesterEnd: "2026-05-01",
    events: { exam: 2, homework: 4, project: 1, lecture: 28 },
    nextEvent: {
      title: "Response Paper 3",
      date: "Mar 25, 2026",
      type: "homework",
    },
  },
  {
    id: "lsc100_s26",
    name: "Science and Storytelling",
    code: "LSC 100",
    term: "Spring 2026",
    uploadedAt: "Jan 22, 2026",
    semesterStart: "2026-01-20",
    semesterEnd: "2026-05-01",
    events: { exam: 1, homework: 6, project: 2, lecture: 28 },
    nextEvent: {
      title: "Final Essay Due",
      date: "Apr 28, 2026",
      type: "project",
    },
  },
];

const TYPE_COLORS = {
  exam: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  homework: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  project: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  lecture: {
    bg: "bg-stone-100",
    text: "text-stone-600",
    border: "border-stone-200",
  },
};

const TYPE_LABELS = {
  exam: "Exam",
  homework: "Homework",
  project: "Project",
  lecture: "Lecture",
};

function totalEvents(course) {
  return Object.values(course.events).reduce((a, b) => a + b, 0);
}

function semesterProgress(start, end) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (now <= s) return 0;
  if (now >= e) return 100;
  return Math.round(((now - s) / (e - s)) * 100);
}

export default function Dashboard({ onNavigate, user }) {
  const displayName = user?.name || "...";
  const displayEmail = user?.email || "";
  const displayAvatar = (user?.name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

  useEffect(() => {
    fetch(`${API}/courses`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setCourses(data);
        setLoadingCourses(false);
      })
      .catch(() => setLoadingCourses(false));
  }, []);
  const isEmpty = courses.length === 0;

  const handleDelete = async (id) => {
    await fetch(`${API}/courses/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setCourses((prev) => prev.filter((c) => c.id !== id));
    setConfirmDelete(null);
  };

  if (loadingCourses)
    return (
      <div className="h-screen bg-ivory-50 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-ink-300 border-t-ink-800 animate-spin" />
      </div>
    );

  return (
    <div className="h-screen overflow-hidden bg-ivory-50 flex flex-col">
      <Nav user={user} onNavigate={onNavigate} page="dashboard" />
      <div className="shrink-0 h-px bg-ivory-300 w-full" />

      <main className="flex-1 min-h-0 flex flex-col px-10 pb-8 max-w-6xl mx-auto w-full">
        {/* Page header */}
        <div className="shrink-0 flex items-center justify-between mt-8 mb-6">
          <div>
            <h2 className="font-serif text-3xl font-bold text-ink-900 leading-tight">
              {isEmpty ? "Get started" : "Your courses"}
            </h2>
            <p className="text-ink-500 text-sm mt-1">
              {isEmpty
                ? "Upload your first syllabus to get started."
                : `${courses.length} course${
                    courses.length !== 1 ? "s" : ""
                  } · Spring 2026`}
            </p>
          </div>
          {!isEmpty && (
            <button
              onClick={() => onNavigate("upload")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ink-900 text-ivory-50
                         text-sm font-medium hover:bg-ink-800 active:scale-[0.98] transition-all duration-150"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add course
            </button>
          )}
        </div>

        {/* Empty state */}
        {isEmpty && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-ivory-200 border border-ivory-300 flex items-center justify-center mb-5">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#B0B0B0"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9,15 12,12 15,15" />
              </svg>
            </div>
            <p className="text-ink-800 font-medium text-base mb-1">
              No courses yet
            </p>
            <p className="text-ink-400 text-sm mb-7 text-center max-w-xs">
              Upload a syllabus PDF and every deadline lands in your Google
              Calendar automatically.
            </p>
            <button
              onClick={() => onNavigate("upload")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-ink-900 text-ivory-50
                         text-sm font-medium hover:bg-ink-800 active:scale-[0.98] transition-all duration-150"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Upload your first syllabus
            </button>
          </div>
        )}

        {/* Course grid — no add card, just courses */}
        {!isEmpty && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pb-2">
              {courses.map((course) => {
                const next = course.nextEvent;
                const total = totalEvents(course);
                const progress = semesterProgress(
                  course.semesterStart,
                  course.semesterEnd
                );

                return (
                  <div
                    key={course.id}
                    className="rounded-2xl border border-ivory-300 bg-white flex flex-col overflow-hidden
                               hover:border-ivory-400 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-200"
                  >
                    <div className="px-5 pt-5 pb-4 flex-1">
                      {/* Course meta */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className="text-[11px] font-semibold text-ink-400 tracking-wider uppercase">
                          {course.code}
                        </span>
                        <span className="text-[11px] text-ink-300 shrink-0">
                          {course.term}
                        </span>
                      </div>
                      <h3 className="font-serif text-base font-bold text-ink-900 leading-snug mb-4">
                        {course.name}
                      </h3>

                      {/* Event breakdown — lectures excluded from grid display */}
                      <div className="grid grid-cols-2 gap-1.5 mb-4">
                        {Object.entries(course.events).map(([type, count]) => {
                          if (count === 0 || type === "lecture") return null;
                          const c = TYPE_COLORS[type];
                          return (
                            <div
                              key={type}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${c.bg} ${c.border}`}
                            >
                              <span
                                className={`text-[11px] font-medium ${c.text}`}
                              >
                                {TYPE_LABELS[type]}
                              </span>
                              <span
                                className={`text-[11px] font-semibold ${c.text}`}
                              >
                                {count}
                              </span>
                            </div>
                          );
                        })}
                        {/* Lectures shown smaller, separate */}
                        {course.events.lecture > 0 && (
                          <div className="col-span-2 flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50">
                            <span className="text-[11px] font-medium text-stone-500">
                              Lectures
                            </span>
                            <span className="text-[11px] font-semibold text-stone-500">
                              {course.events.lecture}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Next deliverable — never a lecture */}
                      {next && (
                        <div className="rounded-xl border border-ivory-300 bg-ivory-50 px-3 py-2.5">
                          <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1">
                            Next up
                          </p>
                          <p className="text-ink-800 text-xs font-medium leading-snug">
                            {next.title}
                          </p>
                          <p className="text-ink-400 text-[11px] mt-0.5">
                            {next.date}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Semester progress bar */}
                    <div className="px-5 pt-3 pb-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-ink-300 uppercase tracking-wider font-semibold">
                          Semester progress
                        </span>
                        <span className="text-[10px] text-ink-400 font-medium">
                          {progress}%
                        </span>
                      </div>
                      <div className="h-1 w-full bg-ivory-300 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-ink-700 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Card footer */}
                    <div className="px-5 py-3 mt-2 border-t border-ivory-200 flex items-center justify-between bg-ivory-50/60">
                      <p className="text-ink-400 text-[11px]">
                        {total} events · Added {course.uploadedAt}
                      </p>
                      <button
                        onClick={() => setConfirmDelete(course.id)}
                        className="text-ink-300 hover:text-red-400 transition-colors duration-150 p-1 rounded-lg hover:bg-red-50"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
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
          </div>
        )}
      </main>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-ink-900/30 flex items-center justify-center z-50 px-6"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-white rounded-2xl border border-ivory-300 p-6 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-serif text-lg font-bold text-ink-900 mb-2">
              Remove this course?
            </h4>
            <p className="text-ink-500 text-sm mb-6 leading-relaxed">
              This will remove the course from your dashboard. Events already in
              your Google Calendar will not be affected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-ivory-300 text-ink-600 text-sm font-medium
                           hover:bg-ivory-100 transition-all duration-150"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium
                           hover:bg-red-600 active:scale-[0.98] transition-all duration-150"
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
