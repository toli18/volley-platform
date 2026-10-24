# backend/app/main.py

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.init_db import init_db

from app.routers.auth import router as auth_router
from app.routers.users import router as users_router
from app.routers.clubs import router as clubs_router
from app.routers.drills import router as drills_router
from app.routers.trainings import router as trainings_router
from app.routers.ai_training import router as ai_training_router
from app.routers.coach_assistant import router as coach_assistant_router
from app.routers.forum import router as forum_router
from app.routers.fees import router as fees_router
from app.routers.teams import router as teams_router
from app.routers.club_head import router as club_head_router
from app.routers.training_assignments import router as training_assignments_router
from app.routers.admin_analytics import router as admin_analytics_router
from app.routers.schedule import router as schedule_router
from app.routers.athlete_room import router as athlete_room_router
from app.routers.athlete_room_auth import router as athlete_room_auth_router
from app.routers.parent_auth import router as parent_auth_router
from app.routers.parent_portal import router as parent_portal_router
from app.routers.team_portal import router as team_portal_router
from app.routers.team_chat import router as team_chat_router
from app.routers.national_method import router as national_method_router
from app.routers.navbar import router as navbar_router
from app.routers.pilot_requests import router as pilot_requests_router
from app.routers.club_public import router as club_public_router
from app.routers.assessments import router as assessments_router
from app.routers.matches import router as matches_router
from app.routers.match_live import router as match_live_router
from app.routers.match_public import router as match_public_router
from app.routers.bvf_admin import router as bvf_admin_router
from app.routers.bvf_carding import router as bvf_carding_router
from app.routers.ris_public import router as ris_public_router
from app.routers.club_consent import docs_router as athlete_docs_router
from app.routers.club_consent import router as club_consent_router
from app.routers.public_carding_03b import router as public_carding_03b_router
from app.routers.public_carding_parent2 import router as public_carding_parent2_router
from app.routers.club_office_docs import router as club_office_docs_router
from app.routers.school_excuse import club_router as school_excuse_club_router
from app.routers.school_excuse import parent_router as school_excuse_parent_router
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
# Local dev + Vercel prod/previews + Railway-hosted SPA
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://volley-platform.vercel.app",
    "https://volley-platform-bul.vercel.app",
    "https://volley-platform-production.up.railway.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https://(.*\.vercel\.app|.*\.up\.railway\.app)$",
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
app.include_router(coach_assistant_router)
app.include_router(articles.router, prefix="/api", tags=["Articles"])
app.include_router(forum_router, prefix="/api", tags=["Forum"])
app.include_router(fees_router, prefix="/api", tags=["Fees"])
app.include_router(teams_router, prefix="/api", tags=["Teams"])
app.include_router(club_head_router, prefix="/api", tags=["Club Head Coach"])
app.include_router(training_assignments_router, prefix="/api", tags=["Training Assignments"])
app.include_router(schedule_router, prefix="/api", tags=["Schedule"])
app.include_router(parent_auth_router, prefix="/api", tags=["Parent Auth"])
app.include_router(athlete_room_auth_router, prefix="/api", tags=["Athlete Room Auth"])
app.include_router(parent_portal_router, prefix="/api", tags=["Parent Portal"])
app.include_router(athlete_room_router, prefix="/api", tags=["Athlete Room"])
app.include_router(team_portal_router, prefix="/api", tags=["Team Portal"])
app.include_router(team_chat_router, prefix="/api", tags=["Team Chat"])
app.include_router(admin_analytics_router, prefix="/api", tags=["Admin Analytics"])
app.include_router(navbar_router, prefix="/api", tags=["Navbar Feed"])
app.include_router(national_method_router)
# prefix="/api/assessments" и tags са дефинирани в самия router (виж assessments.py)
app.include_router(assessments_router)
app.include_router(matches_router)
app.include_router(match_live_router)
app.include_router(match_public_router)
app.include_router(bvf_admin_router)
app.include_router(bvf_carding_router)
app.include_router(ris_public_router)
app.include_router(club_consent_router)
app.include_router(athlete_docs_router)
app.include_router(public_carding_03b_router)
app.include_router(public_carding_parent2_router)
app.include_router(club_office_docs_router)
app.include_router(school_excuse_club_router)
app.include_router(school_excuse_parent_router)
app.include_router(pilot_requests_router, prefix="/api", tags=["Pilot"])
app.include_router(club_public_router)

# --- SPA (lean frontend build under static/web; Railway fallback when Vercel Production is stuck) ---
WEB_DIR = static_dir / "web"
_SPA_RESERVED = frozenset(
    {"api", "auth", "docs", "redoc", "static", "assets", "healthz", "openapi.json", "drills-page", "generator"}
)

if (WEB_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(WEB_DIR / "assets")), name="spa-assets")


@app.api_route("/healthz", methods=["GET", "HEAD"])
def healthz():
    return {"ok": True}


_NO_CACHE_HTML = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}

_ASSET_SUFFIXES = (
    ".js",
    ".css",
    ".map",
    ".mjs",
    ".json",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".txt",
    ".xml",
)


def _spa_index_response():
    index = WEB_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(index, headers=dict(_NO_CACHE_HTML))


@app.api_route("/", methods=["GET", "HEAD"])
def root():
    """HEAD is required: Facebook/Messenger link shim probes with HEAD before opening."""
    index = WEB_DIR / "index.html"
    if index.is_file():
        return FileResponse(index, headers=dict(_NO_CACHE_HTML))
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


@app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
def spa_fallback(full_path: str):
    """Client-side routes for the bundled SPA; never swallow real API prefixes.

    Include HEAD so Messenger/Facebook in-app browsers (l.facebook.com shim) can
    validate the URL instead of getting 405 and a blank white screen.

    Missing hashed assets must 404 (not return index.html) — otherwise iOS Safari
    refuses to execute HTML as a module script and shows a white screen.
    """
    index = WEB_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Not Found")
    first = full_path.split("/", 1)[0]
    if first in _SPA_RESERVED:
        raise HTTPException(status_code=404, detail="Not Found")
    lower = full_path.lower()
    if any(lower.endswith(suf) for suf in _ASSET_SUFFIXES):
        raise HTTPException(status_code=404, detail="Not Found")
    candidate = (WEB_DIR / full_path).resolve()
    try:
        candidate.relative_to(WEB_DIR.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Not Found") from exc
    if candidate.is_file():
        return FileResponse(candidate)
    return _spa_index_response()


# --- Startup ---
@app.on_event("startup")
def startup_event():
    init_db()
