# Публичен API · график (клубен сайт)

Без login. Данните идват от **График** в Volley Coach (правила, отмени, мачове).

**База:** `https://volley-platform-production.up.railway.app`  
**Троян Волей · slug:** `troyanvolley`

---

## Препоръчителен URL (дайте на колегата)

**Опресняване на всеки ~15–30 мин. от сървъра на сайта** (или cron):

```
https://volley-platform-production.up.railway.app/api/public/clubs/troyanvolley/schedule/feed
```

- По подразбиране: **днес + 21 дни**
- Включва **тренировки** (с отмени/премествания) и **състезания**
- Отговорът има `generated_at` и `items[]`

По-дълъг период (до 92 дни):

```
.../schedule/feed?days=45
```

Само една група:

```
.../schedule/feed?team_id=8
```

Групи и `team_id`:

```
GET /api/public/clubs/troyanvolley/teams
```

---

## Други изгледи

| URL | Кога |
|-----|------|
| `.../schedule/feed` | **Клубен сайт, актуален календар** |
| `.../schedule?from=...&to=...` | Произволен период |
| `.../schedule?view=weekly` | Седмичен шаблон (без конкретни дати) |

---

## Примерен отговор (feed)

```json
{
  "slug": "troyanvolley",
  "club_name": "Сдружение ВК Троян Волей",
  "from": "2026-03-18",
  "to": "2026-04-08",
  "count": 42,
  "view": "feed",
  "generated_at": "2026-03-18T10:15:00Z",
  "refresh_hint_minutes": 15,
  "items": [
    {
      "date": "2026-03-18",
      "weekday_label": "Ср",
      "event_type": "training",
      "start_time": "17:30",
      "end_time": "19:00",
      "location": "Троян",
      "team_name": "U14",
      "coach_name": "..."
    }
  ]
}
```

---

## Интеграция

- **PHP / WordPress:** `file_get_contents` или `wp_remote_get` на `/schedule/feed` → рендерирате таблица.
- **JavaScript от troyanvolley.com:** разрешен CORS (виж `CORS_EXTRA_ORIGINS` в Railway).
- Кеш на сайта: не над **5–10 мин**, за да се виждат отмени навреме.

Пълни бележки: същата папка, файл в git `docs/PUBLIC_SCHEDULE_API_BG.md`.