import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./local.db"
    print("⚠️  DATABASE_URL không tìm thấy, dùng SQLite: local.db")
else:
    print("✅ DATABASE_URL loaded OK")

# Fix URL cũ của Heroku: postgres:// → postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)


def _make_engine(url: str):
    """Tạo engine, SQLite cần connect_args riêng."""
    ca = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=ca)


# Thử kết nối Postgres; nếu lỗi → fallback SQLite
engine = _make_engine(DATABASE_URL)

if not DATABASE_URL.startswith("sqlite"):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("✅ Kết nối database thành công")
    except Exception as e:
        print(f"❌ Không thể kết nối database ({e})")
        print("⚠️  Fallback sang SQLite: local.db")
        DATABASE_URL = "sqlite:///./local.db"
        engine = _make_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
