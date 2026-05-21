# BVF национална библиотека — seed данни

## Активни източници

| Файл / модул | Роля |
|--------------|------|
| `bvf_volleycomment_bg.json` | Volley Comment „Наука и спорта“ → AI методика (`ingest_volleycomment`) |
| `bvf_ai_knowledge.json` | Структуриран контекст по възраст за AI (`build_bvf_ai_knowledge`) |
| `bvf_coaching_guidelines_bg.py` | Насоки грешка → корекция |
| `seed_national_method.py` | Мезо/микро цикли + ~22 курирани BG упражнения |

```bash
python -m app.scripts.ingest_volleycomment --export
python -m app.scripts.ingest_volleycomment --import-db
python -m app.scripts.build_bvf_ai_knowledge
python -m app.scripts.sync_cycle_article_links
```

## Премахнати архиви (EN / машинен превод)

`bvf_drills_bg.json` и `bvf_articles_bg.json` са **изтрити от repo** — не се импортират.

Почистване на вече импортнато в БД:

```bash
python -m app.scripts.purge_legacy_bvf_library --dry-run
python -m app.scripts.purge_legacy_bvf_library
```

Или админ API: `POST /api/national-method/admin/purge-legacy-library`
