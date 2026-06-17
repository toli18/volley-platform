# Seed данни — национална методика (един източник: учебник БФВ)

| Файл | Описание |
|------|----------|
| `bvf_textbook_bg.txt` | Пълен учебник БФВ (plain text) |
| `bvf_textbook_bg.json` | Парснати секции + навигация (`ingest_bvf_textbook --export`) |
| `bvf_ai_knowledge.json` | AI контекст по възраст (`build_bvf_ai_knowledge`) |

Методиката, конспектите и периодизацията идват **само от учебника**.  
Националните **упражнения** (federation drills) са отделен куриран списък за AI генератора.

## Импорт (локално или Railway)

```bash
cd backend
python -m app.scripts.extract_youth_session_plans
python -m app.scripts.ingest_bvf_textbook --export --import-db --replace-vc
python -m app.scripts.build_bvf_ai_knowledge
python -m app.scripts.seed_annual_program --replace
python -m app.scripts.purge_legacy_bvf_library
```

## Почистване на legacy (4-седм. шаблони, VC насоки, PDF/GTP)

```bash
python -m app.scripts.purge_legacy_bvf_library --dry-run
python -m app.scripts.purge_legacy_bvf_library
```
