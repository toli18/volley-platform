# Публичен API · график на клуб (за външен сайт)

Без login. Данните идват от същия график, който треньорите поддържат в платформата.

**База (production):** `https://volley-platform-production.up.railway.app`

**Троян Волей · slug:** `troyanvolley`

## 1. График (тренировки + състезания)

```
GET /api/public/clubs/{slug}/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
```

**Седмичен шаблон** (ако календарът е празен заради изтекли `effective_to` в правилата):

```
GET /api/public/clubs/troyanvolley/schedule?view=weekly
GET /api/public/clubs/troyanvolley/schedule?view=weekly&from=2026-03-17
```

Опционални query параметри:

| Параметър      | Описание |
|----------------|----------|
| `view`         | `calendar` (по подразбиране) или `weekly` |
| `team_id`      | само една група (виж списък от `/teams`) |
| `event_type`   | `training` или `competition` (без параметър = и двете) |

Ограничение: периодът `from`..`to` е максимум **92 дни**.

### Пример (Троян, две седмици)

```
https://volley-platform-production.up.railway.app/api/public/clubs/troyanvolley/schedule?from=2026-03-17&to=2026-03-31
```

### Пример за отговор (скъсен)

```json
{
  "slug": "troyanvolley",
  "club_name": "Сдружение ВК Троян Волей",
  "from": "2026-03-17",
  "to": "2026-03-31",
  "count": 2,
  "items": [
    {
      "date": "2026-03-18",
      "weekday": 2,
      "weekday_label": "Ср",
      "event_type": "training",
      "start_time": "17:30",
      "end_time": "19:00",
      "location": "Троян",
      "team_id": 12,
      "team_name": "U14 Момичета",
      "team_label": "U14 · момичета",
      "coach_name": "Иван Иванов",
      "hall_name": null
    }
  ]
}
```

При `event_type: competition` полетата включват `opponent_name`, `competition_kind`, `competition_kind_label`.

## 2. Списък групи (за филтър)

```
GET /api/public/clubs/troyanvolley/teams
```

Връща `teams[]` с `id`, `name`, `age_group`, `gender`, `hint`.

## 3. Интеграция в сайт

**Препоръка:** извличане от **сървъра** на сайта (PHP, Node, WordPress cron), не директно от браузъра, ако не сте настройили CORS.

За JS от `troyanvolley.com` / `www.troyanvolley.com` CORS е позволен на backend (променлива `CORS_EXTRA_ORIGINS` при нужда от друг домейн).

### PHP (server-side)

```php
$url = 'https://volley-platform-production.up.railway.app/api/public/clubs/troyanvolley/schedule'
     . '?from=' . date('Y-m-d')
     . '&to=' . date('Y-m-d', strtotime('+14 days'));
$json = json_decode(file_get_contents($url), true);
```

### JavaScript (браузър, след deploy с CORS)

```javascript
const base = "https://volley-platform-production.up.railway.app";
const from = "2026-03-17";
const to = "2026-03-31";
const res = await fetch(
  `${base}/api/public/clubs/troyanvolley/schedule?from=${from}&to=${to}`
);
const data = await res.json();
```

## 4. Актуализация

Графикът се обновява в Volley Coach (меню **График**). Промените се виждат в API веднага (отговорът може да се кешира до 5 мин. с `Cache-Control`).

## 5. Slug за друг клуб

В настройките **Публична страница** на клуба (`public_slug`) или попитайте администратора. За Троян вече е `troyanvolley`.