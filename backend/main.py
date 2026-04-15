from fastapi import FastAPI, Depends, HTTPException, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime
import httpx
import os
import json
import re
import pdfplumber
import io
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

from backend.database import get_db, create_tables, User, Course
from backend.auth import create_session_token, get_current_user_id

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
    return f"""You are an expert academic calendar parser. Your job is to extract EVERY SINGLE schedulable event from this university syllabus — be exhaustive and aggressive. Do not skip anything.

Return ONLY a valid JSON object with this exact structure, no preamble, no markdown, no explanation:
{{
  "course_name": "Full course name",
  "course_code": "e.g. COMP SCI 300",
  "semester_start": "YYYY-MM-DD",
  "semester_end": "YYYY-MM-DD",
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
   - "Discussion responses due every Wednesday 11:59pm from Jan 28 through Apr 8" → generate one event per Wednesday (Jan 28, Feb 4, Feb 11, Feb 18, Feb 25, Mar 4, Mar 11, Mar 18, Mar 25, Apr 1, Apr 8)
   - "Lecture meets Tuesdays and Thursdays 1:20-2:10" → generate one event per lecture day for the entire semester
   - "Homework due weekly on Fridays" → generate one event per Friday
   Never write a single "recurring" event. Always expand into individual dates.

2. LECTURES: Extract every single class meeting. If the syllabus says "Tuesdays and Thursdays 1:20-2:10pm" generate a lecture event for every Tuesday and Thursday of the semester. Title each one with the topic if given (e.g. "Lecture: Intro to Recursion"), otherwise title it "Lecture".

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
   - homework: papers, written responses, discussion posts, lab reports, problem sets, lecture notes submissions
   - project: multi-week projects, group projects, presentations
   - lecture: class meetings, lectures, discussion sections

8. DATE FORMAT: Always YYYY-MM-DD. Infer the year from context (this is Spring 2026 if not stated).

9. CONFIDENCE: Mark "low" only when you are genuinely unsure about a date. Mark "high" for anything explicitly stated.

10. OMISSIONS: List things commonly found in syllabi that you could NOT find (e.g. if there are no listed exams, note that).

Be thorough. A good parse of a 14-week course should produce 50-100+ events when lectures and weekly assignments are included.

Syllabus text:
{text[:12000]}"""


def parse_syllabus_with_ai(text: str) -> dict:
    """
    Parse syllabus text using GPT-4o mini with JSON mode.
    JSON mode guarantees a valid JSON object back every time —
    no regex fallback parsing needed.
    """
    print(f"Starting AI parse, text length: {len(text)}")
    completion = openai_client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[{"role": "user", "content": _build_prompt(text)}],
        response_format={"type": "json_object"},
        max_completion_tokens=8000,
    )
    return json.loads(completion.choices[0].message.content)


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
        httponly=True, samesite="lax", secure=False,
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


# ─── Parse endpoint ───────────────────────────────────────────────────────────

@app.post("/parse")
async def parse_syllabus(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
):
    """Extract text from PDF and use GPT-4o mini to return structured events."""

    # 1. Read PDF bytes and extract text
    contents = await file.read()
    text     = ""
    with pdfplumber.open(io.BytesIO(contents)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    # 2. Parse with GPT-4o mini
    try:
        parsed = parse_syllabus_with_ai(text)
    except Exception as e:
        print(f"PARSE ERROR: {type(e).__name__}: {e}")  # add this
        raise HTTPException(status_code=500, detail=f"AI parsing failed: {str(e)}")

    return parsed


# ─── Push endpoint ────────────────────────────────────────────────────────────

@app.post("/push")
async def push_to_calendar(
    payload: dict,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Push confirmed events to Google Calendar and save course to DB.
    payload: { course_name, course_code, semester_start, semester_end, events: [...], omissions: [...] }
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.access_token:
        raise HTTPException(status_code=401, detail="No access token")

    events         = payload.get("events", [])
    course_name    = payload.get("course_name", "Unknown Course")
    course_code    = payload.get("course_code", "")
    semester_start = payload.get("semester_start")
    semester_end   = payload.get("semester_end")

    # Build course_id
    slug      = re.sub(r"[^a-z0-9]", "", course_code.lower())
    term_slug = "s26"
    course_id = f"user{user_id}_{slug}_{term_slug}"

    # Check for duplicate
    existing = db.query(Course).filter(Course.course_id == course_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Course already uploaded")

    # Push each event to Google Calendar
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
                            "app_source": "SyllabusApp",
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

    # Count events by type
    event_counts = {"exam": 0, "homework": 0, "project": 0, "lecture": 0}
    for e in events:
        t = e.get("type", "lecture")
        if t in event_counts:
            event_counts[t] += 1

    # Find next deliverable (non-lecture)
    deliverables = [e for e in events if e.get("type") != "lecture"]
    deliverables.sort(key=lambda e: e.get("date", ""))
    today      = datetime.utcnow().strftime("%Y-%m-%d")
    upcoming   = [e for e in deliverables if e.get("date", "") >= today]
    next_event = None
    if upcoming:
        n          = upcoming[0]
        next_event = {"title": n["title"], "date": n["date"], "type": n["type"]}

    # Save course to DB
    course = Course(
        user_id        = user_id,
        course_id      = course_id,
        name           = course_name,
        code           = course_code,
        term           = "Spring 2026",
        semester_start = semester_start,
        semester_end   = semester_end,
        event_counts   = event_counts,
        next_event     = next_event,
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


# ─── Courses ──────────────────────────────────────────────────────────────────

@app.get("/courses")
def get_courses(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    courses = db.query(Course).filter(Course.user_id == user_id).all()
    return [
        {
            "id":             c.course_id,
            "name":           c.name,
            "code":           c.code,
            "term":           c.term,
            "semester_start": c.semester_start,
            "semester_end":   c.semester_end,
            "events":         c.event_counts or {},
            "nextEvent":      c.next_event,
            "uploadedAt":     c.uploaded_at.strftime("%b %d, %Y") if c.uploaded_at else "",
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