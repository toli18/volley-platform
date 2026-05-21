# BVF национална библиотека — seed данни

## Фаза A (активна): Volley Comment „Наука и спорта“

```bash
python -m app.scripts.ingest_volleycomment --export
python -m app.scripts.ingest_volleycomment --import-db
```

Файл: `bvf_volleycomment_bg.json` — български статии от [Volley Comment](https://volleycomment.bg/?s=наука) (с ОК от БФВ).

+ 12 насоки „грешка → корекция“ в `bvf_coaching_guidelines_bg.py`.

## Фаза B: цикли ↔ статии

```bash
python -m app.scripts.sync_cycle_article_links
```

Свързва мезо/микро цикли с препоръчани статии по седмица и „единна програма“.

## Архив (не се показва на треньори по подразбиране)

`bvf_drills_bg.json` / `bvf_articles_bg.json` — стар превод от PDF/GTP.
