# backend/app/main.py

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.init_db import init_db

from app.routers.auth import router as auth_router
from app.routers.users import router as users_router
from app.routers.clubs import router as clubs_router
from app.routers.drills import router as drills_router
from app.routers.trainings import router as trainings_router
from app.routers.ai_training import router as ai_training_router
from app.routers.forum import router as forum_router
from app.routers import articles


app = FastAPI(
    title="Volley Platform API",
    version="1.0.0",
    description="Backend API for Volleyball Platform",
)

BASE_DIR = Path(__file__).resolve().parent

# --- Static + templates (safe: won't crash if folders don't exist) ---
static_dir = BASE_DIR / "static"
templates_dir = BASE_DIR / "templates"

if static_dir.exists() and static_dir.is_dir():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

templates = Jinja2Templates(directory=str(templates_dir)) if templates_dir.exists() else None

# --- CORS ---
# Local dev + Vercel prod + all Vercel preview deployments
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://volley-platform.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routers ---
app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(users_router, prefix="/users", tags=["Users"])
app.include_router(clubs_router, prefix="/clubs", tags=["Clubs"])
app.include_router(drills_router, prefix="/drills", tags=["Drills"])
app.include_router(trainings_router, prefix="/trainings", tags=["Trainings"])
app.include_router(ai_training_router)
app.include_router(articles.router, prefix="/api", tags=["Articles"])
app.include_router(forum_router, prefix="/api", tags=["Forum"])

# --- Root ---
@app.get("/")
def root():
    return {"status": "Volley Platform API is running"}

# --- Pages (ако ги ползваш) ---
@app.get("/drills-page")
def drills_page(request: Request):
    if templates is None:
        return {"error": "Templates directory not found"}
    return templates.TemplateResponse("drills.html", {"request": request})


@app.get("/generator")
def generator_page(request: Request):
    if templates is None:
        return {"error": "Templates directory not found"}
    return templates.TemplateResponse("generator.html", {"request": request})

# --- Startup ---
@app.on_event("startup")
def startup_event():
    init_db()
