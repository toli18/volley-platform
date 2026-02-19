# Volley-Platform-

Volley Platform Единната система за тренировки, упражнения и методика по волейбол.

## Running locally

1. Install dependencies with Poetry (Python 3.11):

```bash
pip install "poetry>=1.8" && poetry install --no-root
```

2. Run database migrations and start the API:

```bash
poetry run alembic upgrade head && poetry run uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

The same command is used by Render during deployment.

## Database seeding

Seed data for clubs is stored in `backend/app/seed/clubs.csv`. The application loads missing rows during startup via `init_db()`.

## Hybrid AI Training Generator

The platform now includes hybrid training generation endpoints:

- `POST /api/ai/training/generate`
- `POST /api/ai/training/generate-and-save`

### How scoring works

The generator is **not LLM-only**. It uses deterministic filtering + scoring:

1. **Hard filters**: age/level/equipment/players/intensity/block-profile/excluded IDs.
2. **Weighted ranking** (`0..1`): goal match, period fit, intensity fit, coverage gain, diversity, duration fit.
3. **Assembly**: picks drills per block, allocates minutes within drill ranges, validates progression and coverage.
4. **Explainability**: each selected drill returns `why[]` + `scoreBreakdown`.

### Tuning weights

Edit `backend/app/services/hybrid_training_generator.py`:

- `weights` in `_score_candidate(...)`
- period block distributions in `PERIOD_SPLITS`
- block defaults in `BLOCK_DEFAULT_DRILL_RANGE`

### Adding new drills

Add drill records with complete metadata (`skill_domains`, `game_phases`, `intensity_type`, duration, players, equipment).  
Better metadata quality directly improves hybrid ranking and explainability.
