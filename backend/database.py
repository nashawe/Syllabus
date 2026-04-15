from sqlalchemy import create_engine, Column, String, Integer, DateTime, JSON
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

    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, nullable=False, index=True)
    course_id      = Column(String, unique=True, nullable=False)  # e.g. user123_math222_s26
    name           = Column(String, nullable=False)
    code           = Column(String, nullable=False)
    term           = Column(String, nullable=False)
    semester_start = Column(String, nullable=True)
    semester_end   = Column(String, nullable=True)
    event_counts   = Column(JSON, nullable=True)   # {exam: 3, homework: 8, ...}
    next_event     = Column(JSON, nullable=True)   # {title, date, type}
    uploaded_at    = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)