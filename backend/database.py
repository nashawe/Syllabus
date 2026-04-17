from sqlalchemy import create_engine, Column, String, Integer, DateTime, JSON, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    google_id     = Column(String, unique=True, index=True, nullable=False)
    email         = Column(String, unique=True, index=True, nullable=False)
    name          = Column(String, nullable=False)
    avatar_url    = Column(String, nullable=True)
    access_token  = Column(String, nullable=True)
    refresh_token = Column(String, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)


class Course(Base):
    __tablename__ = "courses"

    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(Integer, nullable=False, index=True)
    course_id         = Column(String, unique=True, nullable=False)
    name              = Column(String, nullable=False)
    code              = Column(String, nullable=False)
    term              = Column(String, nullable=False)
    semester_start    = Column(String, nullable=True)
    semester_end      = Column(String, nullable=True)
    event_counts      = Column(JSON, nullable=True)
    next_event        = Column(JSON, nullable=True)
    uploaded_at       = Column(DateTime, default=datetime.utcnow)
    # Phase 2 fields
    professor         = Column(String, nullable=True)
    professor_email   = Column(String, nullable=True)
    office_hours      = Column(String, nullable=True)
    location          = Column(String, nullable=True)
    description       = Column(Text, nullable=True)
    grading_breakdown = Column(JSON, nullable=True)
    required_texts    = Column(JSON, nullable=True)
    all_events        = Column(JSON, nullable=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)
    _migrate_courses_table()


def _migrate_courses_table():
    """Add Phase 2 columns to existing courses table if they don't exist."""
    from sqlalchemy import text, inspect as sa_inspect
    try:
        inspector = sa_inspect(engine)
        existing = {col["name"] for col in inspector.get_columns("courses")}
    except Exception:
        return

    new_cols = [
        ("professor",         "VARCHAR"),
        ("professor_email",   "VARCHAR"),
        ("office_hours",      "VARCHAR"),
        ("location",          "VARCHAR"),
        ("description",       "TEXT"),
        ("grading_breakdown", "JSON"),
        ("required_texts",    "JSON"),
        ("all_events",        "JSON"),
    ]

    with engine.connect() as conn:
        changed = False
        for col_name, col_type in new_cols:
            if col_name not in existing:
                conn.execute(text(f"ALTER TABLE courses ADD COLUMN {col_name} {col_type}"))
                changed = True
        if changed:
            conn.commit()
