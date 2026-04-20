import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Lấy biến môi trường từ Railway
DATABASE_URL = os.environ.get("DATABASE_URL")

# Debug để kiểm tra (có thể xoá sau)
print("DEBUG DATABASE_URL =", DATABASE_URL)

if not DATABASE_URL:
    raise ValueError("DATABASE_URL not found!")

# Fix cho Railway (postgres:// -> postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Tạo engine
engine = create_engine(DATABASE_URL)

# Session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base
Base = declarative_base()


# Dependency (nếu dùng FastAPI)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
