from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from dotenv import load_dotenv

# Rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load environment variables
load_dotenv()

from cedict_parser import cedict
from database import engine, Base, get_db
from import models
from sqlalchemy import func

# Tạo các bảng trong database (nếu chưa có)
models.Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    cedict.load()
    yield

app = FastAPI(
    title="汉语Go API",
    version="1.0.0",
    description="API tra từ điển CC-CEDICT & học tiếng Trung theo chuẩn HSK.",
    lifespan=lifespan,
)

# Initialize Limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Configuration from .env
origins = os.getenv("CORS_ORIGINS", "*").split(",")
if "*" in origins:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom Security & Anti-Bot Middleware
@app.middleware("http")
async def security_checks(request: Request, call_next):
    # Detect common bot User-Agents (very basic)
    ua = request.headers.get("user-agent", "").lower()
    bot_keywords = ["python-requests", "aiohttp", "curl", "wget", "headlesschrome"]
    if any(bot in ua for bot in bot_keywords):
        # Allow our own internal calls if needed, otherwise block
        if "localhost" not in request.url.hostname:
            return HTTPException(status_code=403, detail="Bots not allowed").default_response
            
    response = await call_next(request)
    
    # Add Security Headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response



@app.get("/")
def root():
    return {"name": "汉语Go API", "status": "online"}


@app.get("/api/search")
@limiter.limit("30/minute")
def search_words(
    request: Request,
    q: str = Query("", description="Tìm kiếm bằng chữ Hán, pinyin hoặc tiếng Anh"),
    limit: int = Query(40, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Search across the full CC-CEDICT dictionary."""
    results = cedict.search(q, limit=limit, offset=offset)
    return {"query": q, "count": len(results), "results": results}


@app.get("/api/hsk/{level}")
def get_hsk_words(
    level: int,
    limit: int = Query(50, ge=1, le=300),
    offset: int = Query(0, ge=0),
):
    """Get words for a specific HSK level (1-6)."""
    if level < 1 or level > 6:
        return {"error": "Level must be 1-6"}
    return cedict.get_hsk(level, limit=limit, offset=offset)


from sqlalchemy.orm import Session
from fastapi import Depends

@app.post("/api/saved_words")
def save_word(
    word: str, pinyin: str, meaning: str, hsk_level: int = 0,
    db: Session = Depends(get_db)
):
    """Save word to DB."""
    # Check if exists
    existing = db.query(models.SavedWord).filter(models.SavedWord.word == word).first()
    if existing:
        return {"msg": "Already saved", "status": "exists"}
    
    new_word = models.SavedWord(
        user_id=1,
        word=word,
        pinyin=pinyin,
        meaning=meaning,
        hsk_level=hsk_level
    )
    db.add(new_word)
    db.commit()
    return {"msg": "Saved", "status": "success"}

@app.get("/api/saved_words")
def get_saved_words(db: Session = Depends(get_db)):
    """Fetch all saved words from DB."""
    return db.query(models.SavedWord).order_by(models.SavedWord.id.desc()).all()

@app.delete("/api/saved_words/{word_id}")
def delete_saved_word(word_id: int, db: Session = Depends(get_db)):
    """Delete a saved word by ID."""
    word = db.query(models.SavedWord).filter(models.SavedWord.id == word_id).first()
    if word:
        db.delete(word)
        db.commit()
        return {"status": "success"}
    return {"status": "error", "msg": "Not found"}

@app.get("/api/hsk")
def hsk_summary(db: Session = Depends(get_db)):
    """Get summary of all HSK levels with actual progress from DB."""
    summary = cedict.hsk_summary()
    # Đếm số từ đã lưu cho mỗi level
    db_counts = db.query(models.SavedWord.hsk_level, func.count(models.SavedWord.id))\
                  .group_by(models.SavedWord.hsk_level).all()
    
    db_map = {level: count for level, count in db_counts if level > 0}
    
    for s in summary:
        s["learned"] = db_map.get(s["level"], 0)
        
    return summary


@app.get("/api/random")
@limiter.limit("40/minute")
def random_words(
    request: Request,
    level: int = Query(0, ge=0, le=6, description="HSK level (0 = all)"),
    count: int = Query(20, ge=1, le=100),
):
    """Get random vocabulary words."""
    return cedict.random_words(level=level, count=count)


@app.get("/api/lookup/{word}")
def lookup_word(word: str):
    """Exact lookup of a word."""
    result = cedict.lookup(word)
    if result:
        return result
    return {"error": "Not found", "word": word}
