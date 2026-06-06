# Seed данни — национална методика

| Файл | Описание |
|------|----------|
| `bvf_textbook_bg.txt` | Пълен учебник БФВ (plain text) |
| `bvf_textbook_bg.json` | Парснати секции + навигация (`ingest_bvf_textbook --export`) |
| `bvf_ai_knowledge.json` | Структуриран AI контекст по възраст (`build_bvf_ai_knowledge`) |

## Импорт (локално или Railway)

```bash
cd backend
python -m app.scripts.ingest_bvf_textbook --export --import-db --replace-vc
python -m app.scripts.build_bvf_ai_knowledge
```

`--replace-vc` изтрива Volley Comment от библиотеката.

## Почистване на legacy

```bash
python -m app.scripts.purge_legacy_bvf_library --dry-run
python -m app.scripts.purge_legacy_bvf_library
```
