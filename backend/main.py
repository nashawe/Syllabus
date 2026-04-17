from fastapi import FastAPI, Depends, HTTPException, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime
import httpx
import os
import json
import re
import uuid
import pdfplumber
import io
from dotenv import load_dotenv
from openai import OpenAI
from collections import defaultdict

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

from database import get_db, create_tables, User, Course
from auth import create_session_token, get_current_user_id

GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI")
FRONTEND_URL         = os.getenv("FRONTEND_URL")
OPENAI_API_KEY       = os.getenv("OPENAI_API_KEY")

GOOGLE_AUTH_URL     = "https://accounts.google.com/o/oauth2/auth"
GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token"
GOOGLE_USER_URL     = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_CALENDAR_URL = "https://www.googleapis.com/calendar/v3"

SCOPES = " ".join([
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar.events",
])

# ─── AI setup ─────────────────────────────────────────────────────────────────

openai_client = OpenAI(api_key=OPENAI_API_KEY)


def _build_prompt(text: str) -> str:
    return f"""You are an expert academic calendar parser. Extract EVERY schedulable event AND all key course metadata from this university syllabus — be exhaustive and aggressive.

Return ONLY a valid JSON object with this exact structure, no preamble, no markdown, no explanation:
{{
  "course_name": "Full course name",
  "course_code": "e.g. COMP SCI 300",
  "semester_start": "YYYY-MM-DD",
  "semester_end": "YYYY-MM-DD",
  "professor": "Professor name or null",
  "professor_email": "email@university.edu or null",
  "office_hours": "e.g. Mon/Wed 2-4pm, Room 123 or null",
  "location": "e.g. Science Hall 180 or null",
  "description": "1-2 sentence course description or null",
  "grading_breakdown": [
    {{"component": "Exams", "weight": "40%"}},
    {{"component": "Homework", "weight": "30%"}}
  ],
  "required_texts": ["Author Last, First. Title. Publisher, Year."],
  "events": [
    {{
      "title": "Event title",
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "end_time": "HH:MM",
      "type": "exam|homework|project|lecture",
      "description": "brief description or empty string",
      "confidence": "high|low"
    }}
  ],
  "omissions": [
    {{
      "title": "Item name",
      "reason": "Why it wasn't found",
      "type": "exam|homework|project|lecture"
    }}
  ]
}}

CRITICAL RULES — follow every single one:

1. RECURRING EVENTS: If the syllabus mentions something happens weekly or on a repeating schedule, generate a SEPARATE event entry for EVERY SINGLE occurrence. For example:
   - "Discussion responses due every Wednesday 11:59pm from Jan 28 through Apr 8" → generate one event per Wednesday
   - "Lecture meets Tuesdays and Thursdays 1:20-2:10" → generate one event per lecture day for the entire semester
   Never write a single "recurring" event. Always expand into individual dates.

2. LECTURES: Extract every single class meeting. If the syllabus says "Tuesdays and Thursdays 1:20-2:10pm" generate a lecture event for every Tuesday and Thursday of the semester.

3. PAPERS AND ASSIGNMENTS: Every paper, assignment, project, lab report, or written submission is a separate homework or project event.

4. EXAMS AND QUIZZES: Extract every exam, midterm, final, and quiz with exact dates and times.

5. OFFICE HOURS: If office hours are listed with specific days/times, generate recurring events for those too.

6. TIME RULES:
   - If a specific time is given, use it exactly
   - For assignment due dates with no time, use "23:59"
   - For exams with no time, use "09:00" and set confidence "low"
   - end_time: for lectures use start + class duration, for assignments use "23:59", for exams guess 90 minutes

7. TYPE RULES:
   - exam: midterms, finals, quizzes, tests
   - homework: papers, written responses, discussion posts, lab reports, problem sets
   - project: multi-week projects, group projects, presentations
   - lecture: class meetings, lectures, discussion sections

8. DATE FORMAT: Always YYYY-MM-DD. Infer the year from context (this is Spring 2026 if not stated).

9. CONFIDENCE: Mark "low" only when you are genuinely unsure about a date.

10. OMISSIONS: List things commonly found in syllabi that you could NOT find.

11. METADATA: Extract professor name, email, office hours, and location from the contact/instructor section. For grading_breakdown, extract every graded component with its percentage weight. For required_texts, list each required book/text. Use null for any field not found.

Be thorough. A good parse of a 14-week course should produce 50-100+ events.

Syllabus text:
{text[:12000]}"""


def parse_syllabus_with_ai(text: str) -> dict:
    print(f"Starting AI parse, text length: {len(text)}")
    completion = openai_client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[{"role": "user", "content": _build_prompt(text)}],
        response_format={"type": "json_object"},
        max_completion_tokens=8000,
    )
    return json.loads(completion.choices[0].message.content)


def _times_overlap(start1: str, end1: str, start2: str, end2: str) -> bool:
    """Check if two HH:MM time ranges overlap."""
    try:
        s1 = int(start1.replace(":", ""))
        e1 = int(end1.replace(":", ""))
        s2 = int(start2.replace(":", ""))
        e2 = int(end2.replace(":", ""))
        return not (e1 <= s2 or e2 <= s1)
    except Exception:
        return False


def _create_ics(events: list, course_name: str, course_code: str) -> bytes:
    from icalendar import Calendar, Event as ICalEvent
    cal = Calendar()
    cal.add("prodid", "-//Deadlined//deadlined.app//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")

    for ev in events:
        ie = ICalEvent()
        ie.add("uid", str(uuid.uuid4()))
        ie.add("summary", ev.get("title", "Event"))

        date_str = ev.get("date", "")
        time_str = ev.get("time", "09:00")
        end_time_str = ev.get("end_time", "10:00")

        try:
            start_dt = datetime.strptime(f"{date_str}T{time_str}", "%Y-%m-%dT%H:%M")
            end_dt   = datetime.strptime(f"{date_str}T{end_time_str}", "%Y-%m-%dT%H:%M")
            ie.add("dtstart", start_dt)
            ie.add("dtend", end_dt)
        except Exception:
            continue

        desc_parts = []
        if course_name:
            desc_parts.append(course_name)
        if ev.get("description"):
            desc_parts.append(ev["description"])
        if desc_parts:
            ie.add("description", "\n".join(desc_parts))

        ev_type = ev.get("type", "other")
        ie.add("categories", [ev_type.upper()])

        cal.add_component(ie)

    return cal.to_ical()


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    create_tables()


# ─── Auth ─────────────────────────────────────────────────────────────────────

@app.get("/auth/login")
def login():
    params = (
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope={SCOPES.replace(' ', '%20')}"
        f"&access_type=offline"
        f"&prompt=consent"
    )
    return RedirectResponse(url=GOOGLE_AUTH_URL + params)


@app.get("/auth/callback")
async def auth_callback(code: str, db: Session = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        token_response = await client.post(GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri":  GOOGLE_REDIRECT_URI,
            "grant_type":    "authorization_code",
        })

    if token_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange auth code")

    tokens        = token_response.json()
    access_token  = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")

    async with httpx.AsyncClient() as client:
        user_response = await client.get(
            GOOGLE_USER_URL,
            headers={"Authorization": f"Bearer {access_token}"}
        )

    if user_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch user profile")

    profile = user_response.json()
    user    = db.query(User).filter(User.google_id == profile["id"]).first()

    if user:
        user.access_token  = access_token
        user.refresh_token = refresh_token or user.refresh_token
        user.avatar_url    = profile.get("picture")
    else:
        user = User(
            google_id     = profile["id"],
            email         = profile["email"],
            name          = profile["name"],
            avatar_url    = profile.get("picture"),
            access_token  = access_token,
            refresh_token = refresh_token,
        )
        db.add(user)

    db.commit()
    db.refresh(user)

    session_token = create_session_token(user.id)
    response      = RedirectResponse(url=FRONTEND_URL)
    response.set_cookie(
        key="session", value=session_token,
        httponly=True, samesite="lax", secure=True,
        max_age=60 * 60 * 24 * 30,
    )
    return response


@app.get("/auth/me")
def get_me(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user.id, "name": user.name, "email": user.email, "avatar_url": user.avatar_url}


@app.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie("session")
    return {"ok": True}


# ─── Parse endpoints ──────────────────────────────────────────────────────────

@app.post("/parse")
async def parse_syllabus(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
):
    """Extract text from PDF and parse with AI."""
    contents = await file.read()
    text = ""
    with pdfplumber.open(io.BytesIO(contents)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    try:
        parsed = parse_syllabus_with_ai(text)
    except Exception as e:
        print(f"PARSE ERROR: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"AI parsing failed: {str(e)}")

    return parsed


@app.post("/parse-text")
async def parse_text(
    payload: dict,
    user_id: int = Depends(get_current_user_id),
):
    """Parse pasted syllabus text directly — skips PDF extraction."""
    text = payload.get("text", "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        parsed = parse_syllabus_with_ai(text)
    except Exception as e:
        print(f"PARSE ERROR: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"AI parsing failed: {str(e)}")

    return parsed


# ─── Push endpoint ────────────────────────────────────────────────────────────

@app.post("/push")
async def push_to_calendar(
    payload: dict,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.access_token:
        raise HTTPException(status_code=401, detail="No access token")

    events         = payload.get("events", [])
    course_name    = payload.get("course_name", "Unknown Course")
    course_code    = payload.get("course_code", "")
    semester_start = payload.get("semester_start")
    semester_end   = payload.get("semester_end")

    slug      = re.sub(r"[^a-z0-9]", "", course_code.lower())
    term_slug = "s26"
    course_id = f"user{user_id}_{slug}_{term_slug}"

    existing = db.query(Course).filter(Course.course_id == course_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Course already uploaded")

    pushed  = 0
    headers = {"Authorization": f"Bearer {user.access_token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient() as client:
        for event in events:
            try:
                date     = event.get("date")
                time     = event.get("time", "09:00")
                end_time = event.get("end_time") or "10:00"

                start_dt = f"{date}T{time}:00"
                end_dt   = f"{date}T{end_time}:00"

                body = {
                    "summary":     event.get("title"),
                    "description": event.get("description", ""),
                    "start": {"dateTime": start_dt, "timeZone": "America/Chicago"},
                    "end":   {"dateTime": end_dt,   "timeZone": "America/Chicago"},
                    "extendedProperties": {
                        "private": {
                            "app_source": "DeadlinedApp",
                            "course_id":  course_id,
                            "event_type": event.get("type", ""),
                        }
                    }
                }

                resp = await client.post(
                    f"{GOOGLE_CALENDAR_URL}/calendars/primary/events",
                    headers=headers,
                    json=body,
                )
                if resp.status_code in (200, 201):
                    pushed += 1

            except Exception:
                continue

    event_counts = {"exam": 0, "homework": 0, "project": 0, "lecture": 0}
    for e in events:
        t = e.get("type", "lecture")
        if t in event_counts:
            event_counts[t] += 1

    deliverables = [e for e in events if e.get("type") != "lecture"]
    deliverables.sort(key=lambda e: e.get("date", ""))
    today    = datetime.utcnow().strftime("%Y-%m-%d")
    upcoming = [e for e in deliverables if e.get("date", "") >= today]
    next_event = None
    if upcoming:
        n          = upcoming[0]
        next_event = {"title": n["title"], "date": n["date"], "type": n["type"]}

    course = Course(
        user_id           = user_id,
        course_id         = course_id,
        name              = course_name,
        code              = course_code,
        term              = "Spring 2026",
        semester_start    = semester_start,
        semester_end      = semester_end,
        event_counts      = event_counts,
        next_event        = next_event,
        professor         = payload.get("professor"),
        professor_email   = payload.get("professor_email"),
        office_hours      = payload.get("office_hours"),
        location          = payload.get("location"),
        description       = payload.get("description"),
        grading_breakdown = payload.get("grading_breakdown"),
        required_texts    = payload.get("required_texts"),
        all_events        = events,
    )
    db.add(course)
    db.commit()
    db.refresh(course)

    return {
        "ok":             True,
        "pushed":         pushed,
        "course_id":      course_id,
        "course_name":    course_name,
        "course_code":    course_code,
        "event_counts":   event_counts,
        "next_event":     next_event,
        "semester_start": semester_start,
        "semester_end":   semester_end,
        "uploaded_at":    course.uploaded_at.strftime("%b %d, %Y"),
    }


# ─── Conflicts endpoint ───────────────────────────────────────────────────────

@app.post("/conflicts")
async def check_conflicts(
    payload: dict,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Check new events against Google Calendar and existing DB courses for conflicts."""
    events         = payload.get("events", [])
    semester_start = payload.get("semester_start", "")
    semester_end   = payload.get("semester_end", "")

    if not events:
        return {"conflicts": []}

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.access_token:
        return {"conflicts": []}

    # 1. Fetch existing Google Calendar events
    gcal_events = []
    if semester_start and semester_end:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{GOOGLE_CALENDAR_URL}/calendars/primary/events",
                    headers={"Authorization": f"Bearer {user.access_token}"},
                    params={
                        "timeMin":       f"{semester_start}T00:00:00Z",
                        "timeMax":       f"{semester_end}T23:59:59Z",
                        "singleEvents":  "true",
                        "maxResults":    500,
                    },
                )
                if resp.status_code == 200:
                    for item in resp.json().get("items", []):
                        start_raw = item.get("start", {})
                        date_str  = (start_raw.get("dateTime") or start_raw.get("date", ""))[:10]
                        time_str  = "00:00"
                        end_str   = "23:59"
                        if "dateTime" in start_raw:
                            time_str = start_raw["dateTime"][11:16]
                        if "dateTime" in item.get("end", {}):
                            end_str = item["end"]["dateTime"][11:16]
                        gcal_events.append({
                            "title":    item.get("summary", "Calendar event"),
                            "date":     date_str,
                            "time":     time_str,
                            "end_time": end_str,
                            "type":     "external",
                        })
        except Exception as exc:
            print(f"GCal fetch error: {exc}")

    # 2. Gather DB course events
    existing_courses = db.query(Course).filter(Course.user_id == user_id).all()
    db_events = []
    for c in existing_courses:
        for e in (c.all_events or []):
            db_events.append({**e, "_course_code": c.code})

    all_existing = gcal_events + db_events

    raw_conflicts = []

    # exact_overlap: same date, overlapping times, both non-lecture
    for new_ev in events:
        if new_ev.get("type") == "lecture":
            continue
        for ex_ev in all_existing:
            if ex_ev.get("type") in ("lecture",):
                continue
            if new_ev.get("date") != ex_ev.get("date"):
                continue
            if _times_overlap(
                new_ev.get("time", "00:00"), new_ev.get("end_time", "23:59"),
                ex_ev.get("time", "00:00"),  ex_ev.get("end_time", "23:59"),
            ):
                raw_conflicts.append({
                    "event_a":       new_ev,
                    "event_b":       ex_ev,
                    "conflict_type": "exact_overlap",
                    "ai_summary":    "",
                })

    # same_day_cluster: 3+ non-lecture events on same day
    day_map: dict[str, list] = defaultdict(list)
    for e in events:
        if e.get("type") != "lecture":
            day_map[e["date"]].append(e)
    for e in all_existing:
        if e.get("type") not in ("lecture", "external"):
            day_map[e.get("date", "")].append(e)

    reported_days: set[str] = set()
    for day, day_evs in day_map.items():
        if len(day_evs) >= 3 and day not in reported_days:
            new_on_day = [e for e in events if e.get("date") == day and e.get("type") != "lecture"]
            if new_on_day:
                others = len(day_evs) - 1
                raw_conflicts.append({
                    "event_a": new_on_day[0],
                    "event_b": {
                        "title": f"{others} other deadline{'s' if others != 1 else ''} on this day",
                        "date":  day,
                        "type":  "cluster",
                    },
                    "conflict_type": "same_day_cluster",
                    "ai_summary":    "",
                })
                reported_days.add(day)

    if not raw_conflicts:
        return {"conflicts": []}

    # Generate AI summaries in one batch call
    try:
        conflict_lines = "\n".join(
            f"{i+1}. '{c['event_a']['title']}' on {c['event_a']['date']} vs "
            f"'{c['event_b']['title']}' ({c['conflict_type'].replace('_', ' ')})"
            for i, c in enumerate(raw_conflicts)
        )
        completion = openai_client.chat.completions.create(
            model="gpt-5.4-mini",
            messages=[{
                "role": "user",
                "content": (
                    "For each calendar conflict write one plain English sentence "
                    "(e.g. 'Your CS 300 exam overlaps with a Biology lab already on your calendar'). "
                    f'Return JSON: {{"summaries": ["sentence 1", ...]}}\n\nConflicts:\n{conflict_lines}'
                ),
            }],
            response_format={"type": "json_object"},
            max_completion_tokens=600,
        )
        summaries = json.loads(completion.choices[0].message.content).get("summaries", [])
        for i, c in enumerate(raw_conflicts):
            if i < len(summaries):
                c["ai_summary"] = summaries[i]
    except Exception as exc:
        print(f"Conflict summary error: {exc}")
        for c in raw_conflicts:
            if not c["ai_summary"]:
                c["ai_summary"] = (
                    f"{c['event_a']['title']} conflicts with "
                    f"{c['event_b']['title']} on {c['event_a']['date']}"
                )

    return {"conflicts": raw_conflicts}


# ─── ICS export ───────────────────────────────────────────────────────────────

@app.post("/export/ics")
async def export_ics(
    payload: dict,
    user_id: int = Depends(get_current_user_id),
):
    """Return a .ics calendar file for the given events."""
    events      = payload.get("events", [])
    course_name = payload.get("course_name", "")
    course_code = payload.get("course_code", "")

    ics_bytes = _create_ics(events, course_name, course_code)
    filename  = re.sub(r"[^a-z0-9]", "_", course_code.lower()) or "deadlined"

    return Response(
        content=ics_bytes,
        media_type="text/calendar",
        headers={"Content-Disposition": f'attachment; filename="{filename}.ics"'},
    )


# ─── Courses ──────────────────────────────────────────────────────────────────

@app.get("/courses")
def get_courses(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    courses = db.query(Course).filter(Course.user_id == user_id).all()
    return [
        {
            "id":               c.course_id,
            "name":             c.name,
            "code":             c.code,
            "term":             c.term,
            "semesterStart":    c.semester_start,
            "semesterEnd":      c.semester_end,
            "events":           c.event_counts or {},
            "nextEvent":        c.next_event,
            "uploadedAt":       c.uploaded_at.strftime("%b %d, %Y") if c.uploaded_at else "",
            "professor":        c.professor,
            "professorEmail":   c.professor_email,
            "officeHours":      c.office_hours,
            "location":         c.location,
            "description":      c.description,
            "gradingBreakdown": c.grading_breakdown,
            "requiredTexts":    c.required_texts,
            "allEvents":        c.all_events or [],
        }
        for c in courses
    ]


@app.delete("/courses/{course_id}")
def delete_course(course_id: str, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.course_id == course_id, Course.user_id == user_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    db.delete(course)
    db.commit()
    return {"ok": True}


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}
