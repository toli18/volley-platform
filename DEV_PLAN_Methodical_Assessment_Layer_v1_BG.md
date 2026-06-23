# Development Plan – Национална диагностична карта v1

> **Methodical Assessment Layer v1** — план за разработка, обвързан с реалната кодова база на платформата
> (FastAPI backend + React/Vite frontend) и реалната тестова батерия на БФВ.
> Версия: v1 · Език: български · За екип за разработка.

---

## Обхват на v1

Модулът добавя нов домейн **„Assessment"** върху съществуващата система. Той позволява:
- дигитализиране на националната тестова батерия като версиониран стандарт;
- провеждане на 6-месечни **тестови прозорци** (baseline / mid / endline) по отбори;
- въвеждане на индивидуални резултати и автоматична **отборна карта** (средно на 8-те най-добри);
- изчисляване на **Development Score** (за състезателя) и **Методически Индекс** (за треньор/клуб/нация);
- **връзка с AI генератора** — дефицитите от тестовете насочват генерирането на тренировки;
- **федеративно табло v1** с 6 агрегирани плочки.

v1 НЕ включва: публично класиране на деца, видео-анализ, прогнозни модели за „потенциал", външни интеграции.

---

## Технологични решения и решения за дизайн

### Основни модели (в `backend/app/models.py`)

Следваме съществуващата конвенция: PascalCase класове, snake_case таблици, `Index(...)` в `__table_args__`.

| Модел | Таблица | Роля |
|---|---|---|
| `TestDefinition` | `test_definitions` | Каноничен запис на един тест (код, име, категория, мярка, посока, протокол, версия, възрастов обхват) |
| `AssessmentWindow` | `assessment_windows` | Сезон + цикъл + прозорец (baseline/mid/endline) + диапазон дати |
| `AssessmentSession` | `assessment_sessions` | Тестване на конкретен отбор в прозорец (отбор, треньор, дата, статус) |
| `AssessmentResult` | `assessment_results` | Единичен резултат: сесия × състезател × тест × сурова стойност (+ нормализирана) |
| `AssessmentNorm` | `assessment_norms` | Норма/перцентили по тест × възрастова група × пол |
| `DevelopmentScore` | `development_scores` | Кеширан резултат за състезател × прозорец (технически/физически под-индекс, общ скор, делта) |
| `MethodicalIndexSnapshot` | `methodical_index_snapshots` | Кеширан Методически Индекс за отбор/клуб × прозорец |

> Категориите на тестовете и посоката се пазят като enum-и: `TestCategory` (technical / speed / physical / anthropometry) и `TestDirection` (higher_better / lower_better / context).

### Интеграция с AI генератора

Генераторът се преизползва **без форкване**. Текущият вход е `GenerateRequest` в `backend/app/routers/ai_training.py` (полета `mainFocus`, `focusSkills`, `focusDomains`, `constraints.mustIncludeDomains`, `ageBand`, `level`, …) и ядрото `generate_training_session` от `backend/app/services/bulgarian_training_generator.py`.

- Нов сервис `backend/app/services/assessment_generator_bridge.py` чете последния `DevelopmentScore` + нормализираните резултати на състезателя, намира дефицитите (нормализиран < праг) и **сглобява `GenerateRequest`** чрез мапинг `TEST_TO_DOMAIN`.
- Препоръчителен малък рефактор: изнасяне на самото генериране от endpoint-а в обща функция (напр. `services/training_generation.py::run_generation(req, user, db)`), която ползват и `ai_training.py`, и bridge-ът.

**Мапинг тест → домейн на генератора (`TEST_TO_DOMAIN`):**

| Код на тест | Домейн/умение |
|---|---|
| `TECH_PASS_TOP`, `TECH_PASS_BOT` | прием / горно подаване |
| `TECH_SERVE` | сервис |
| `TECH_ATTACK` | нападение |
| `SPEED_9363` | бързина / придвижване |
| `PHYS_*` (скокове, мед. топка) | експлозивност / физическа подготовка |

### Изчисление на Development Score и Методически Индекс

Цялата логика е в `backend/app/services/assessment_scoring.py` и `backend/app/services/methodical_index.py`.

**Development Score (състезател, прозорец):**
```
norm(test)        = нормализация на суровата стойност спрямо AssessmentNorm
                    (за SPEED_9363 скалата се обръща; PHYS се контекстуализира с ръст)
technical_subidx  = средно(norm) на техническите тестове        # 0–100
physical_subidx   = средно(norm) на физическите тестове          # 0–100
development_score = w_t * technical_subidx + w_p * physical_subidx  # default 0.5 / 0.5
delta             = development_score(N) − development_score(N−1)    # водещ показател
```

**Методически Индекс (отбор/клуб, прозорец):**
```
adoption     = активна годишна програма? (0–100)
discipline   = тествани в прозореца / ростер * 100
development  = нормализирано средно delta на отбора (0–100)
methodical_index = w1*adoption + w2*discipline + w3*development   # default 0.3 / 0.3 / 0.4
```

Теглата (`w_*`) са конфигурируеми константи в сервиса, за да може методическият комитет да ги настрои без миграция.

---

## Фази на разработка (с конкретни задачи)

### Phase 0 – Backend Foundation

**Цел:** схема на данните + каноничната батерия + регистрация.

Задачи:
1. Добави enum-ите `TestCategory`, `TestDirection` и моделите `TestDefinition`, `AssessmentWindow`, `AssessmentSession`, `AssessmentResult`, `AssessmentNorm`, `DevelopmentScore`, `MethodicalIndexSnapshot` в `backend/app/models.py` (с индекси: `assessment_results(session_id)`, `assessment_results(athlete_id, test_code)`, `development_scores(athlete_id, window_id)`).
2. Нова Alembic миграция `backend/app/migrations/versions/<rev>_assessment_layer.py` (chain на текущия head `a9f1d23c7e84`) — създава таблиците + индексите, guard-ната с `inspector`.
3. Дефиниция на батерията като данни: `backend/app/national_method/assessment_battery.py` (13-те реални теста с кодове, протоколи, мерки, посока) — батерията е част от методическата библиотека.
4. Seed на батерията: функция `seed_assessment_battery()` извикана от `backend/app/init_db.py` (по модела на другите seed функции, под advisory lock).
5. Pydantic схеми: `backend/app/schemas/assessment.py` (`TestDefinitionOut`, `AssessmentWindowIn/Out`, `AssessmentSessionIn/Out`, `AssessmentResultIn`, `ResultBulkIn`, `DevelopmentScoreOut`, `TeamCardOut`, `MethodicalIndexOut`, `FederationDashboardOut`).
6. Нов router `backend/app/routers/assessments.py` (prefix `/api/assessments`) — скелет с празни endpoint-и и `require_role`.
7. Регистрация в `backend/app/main.py`: `from app.routers.assessments import router as assessments_router` + `app.include_router(assessments_router)`.

### Phase 1 – Core Functionality

**Цел:** записване на тестове, изчисление на scores, връзка с AI.

Задачи:
1. **Прозорци и сесии** в `assessments.py`:
   - `POST /api/assessments/windows` (админ/гл. треньор) — открива прозорец;
   - `POST /api/assessments/sessions` (треньор) — създава сесия за отбор+прозорец;
   - `GET /api/assessments/sessions/{id}` — сесия с резултати.
2. **Въвеждане на резултати:**
   - `PUT /api/assessments/sessions/{id}/results` — bulk запис (редове състезатели × тестове), валидиране по мярка;
   - `POST /api/assessments/sessions/{id}/finalize` — приключва сесия.
3. **Отборна карта:** функция `compute_team_card(session)` в `assessment_scoring.py` — средно на 8-те най-добри по показател.
4. **Норми (provisional):** `backend/app/services/assessment_norms.py` — стартова референтна таблица + функция за изчисляване на перцентили; при недостатъчни данни маркира резултата като „индикативен".
5. **Scores:** `assessment_scoring.py::compute_development_score(athlete, window)` + кеширане в `DevelopmentScore`; `methodical_index.py::compute_methodical_index(team, window)`.
   - `GET /api/assessments/athletes/{id}/development` — карта за развитие (данни);
   - `GET /api/assessments/teams/{id}/index` — Методически Индекс.
6. **Bridge към генератора:** `backend/app/services/assessment_generator_bridge.py::build_generate_request(athlete, window)` + endpoint `POST /api/assessments/athletes/{id}/recommend-training` (връща prefilled `GenerateRequest` или директно вика `run_generation`).
7. Рефактор: изнеси генерирането от `ai_training.py` в `services/training_generation.py` (преизползване).

### Phase 2 – Frontend & UI

**Цел:** конкретните екрани (React, по конвенцията `src/pages/...`).

Задачи:
1. API пътища: добави в `frontend/volley-platform-client/src/utils/apiPaths.js` (`ASSESSMENT_WINDOWS`, `ASSESSMENT_SESSIONS`, `ASSESSMENT_DEVELOPMENT`, `ASSESSMENT_RECOMMEND`, …).
2. **Екран 1 — Тестова батерия:** `src/pages/admin/AdminAssessmentBattery.jsx` (управление за БФВ админ) + read-only изглед в `CoachBvfHub.jsx`/`Textbook.jsx`. Елементи: каталог, детайл с протокол/видео/точкуване. *(P0 за стандарта)*
3. **Екран 2 — Диагностична сесия (въвеждане):** `src/pages/coach/CoachAssessmentSession.jsx` + компонент `src/components/assessment/AssessmentEntryGrid.jsx` (mobile-first грид) + `TeamCardPanel.jsx` (жива отборна карта). CTA: „Започни прозорец", „Запази чернова", „Приключи сесия".
4. **Екран 3 — Карта за развитие:** `src/pages/coach/AthleteDevelopmentCard.jsx` + компоненти `DevelopmentScoreChart.jsx`, `DeficitRecommendations.jsx`. CTA: **„Генерирай тренировка по диагнозата"**, „Сподели с родител", „Изтегли PDF". Изглед и в `ParentPortal.jsx` / `TeamRoomPortal.jsx` (със съгласие).
5. Навигация и рутиране: добави елементи в `src/navigation/useNavItems.js` и маршрути в `src/main.jsx` (с `ProtectedRoute` / `AdminGuard`).

### Phase 3 – Федеративно табло v1

**Цел:** агрегиран национален изглед.

Задачи:
1. Backend агрегации в `assessments.py`: `GET /api/assessments/federation/dashboard` (само `platform_admin` / `federation_admin`) — връща 6-те плочки агрегирано, **без лични данни на дете**. Тежките заявки в `methodical_index.py` / нов `assessment_dashboard.py`.
2. Frontend: `src/pages/admin/FederationDashboard.jsx` + компоненти за плочките в `src/components/assessment/dashboard/`.
3. **6-те плочки:** Покритие · Развитие (Δ по възраст) · Приемане · Национални репери (тест × възраст × пол) · Лидери и риск (по Методически Индекс) · Дисциплина на измерване.
4. Филтри по възрастова група / пол / регион + етикет „индикативни данни" при малко проби.
5. (По избор) `src/pages/coach/CoachTeamAssessmentOverview.jsx` — преглед на отбора за главния треньор.

### Phase 4 – Политики, права и governance

Задачи:
1. **Права:** battery CRUD само за `platform_admin`/`federation_admin`; сесии/резултати за `coach`/`club_head_coach` (само свои отбори); федеративно табло само за админите — чрез `require_role(...)`.
2. **Поверителност:** на национално ниво само агрегирано; индивидуалната „Карта за развитие" към родител изисква маркер за съгласие (поле/таблица `assessment_consent`).
3. **Версиониране на батерията:** поле `version` + забрана за редакция на вече използвана версия (нова версия вместо промяна) — за сравнимост на данните.
4. **Audit/целостност:** заключване на приключени сесии; журнал на промените на батерията.
5. **Документация на протоколите:** видео/инструкция към всеки тест за униформено провеждане.

---

## Обща оценка на усилието

При **един компетентен full-stack разработчик на пълно работно време**:

| Фаза | Оценка |
|---|---|
| Phase 0 – Backend Foundation | ~5–7 дни |
| Phase 1 – Core Functionality | ~6–9 дни |
| Phase 2 – Frontend & UI | ~7–10 дни |
| Phase 3 – Федеративно табло v1 | ~5–7 дни |
| Phase 4 – Политики и governance | ~3–5 дни |
| **Общо** | **~26–38 дни ≈ 5.5–8 седмици** |

С фокусиран екип (1 backend + 1 frontend паралелно) реалистично **~4–5 седмици**.

### Най-рискови части
1. **Норми и cold-start** *(методически риск, най-висок)* — без достатъчно данни нормализирането е нестабилно. Нужна е стартова референтна таблица, одобрена от методическия комитет, и ясно етикетиране „индикативно". Засяга достоверността на Development Score.
2. **UX на въвеждане на терен** *(adoption риск)* — `AssessmentEntryGrid` е екранът „прави или проваля". Ако е тромав на телефон, треньорите се връщат на хартия.
3. **Свързване с генератора** *(технически риск)* — изисква чист рефактор, за да не дублираме логиката на генериране.
4. **Униформено провеждане на тестовете** *(операционен риск)* — несравними данни при различни протоколи; смекчава се с видео-инструкции и валидиране.
5. **Лични данни на непълнолетни** *(правен риск)* — агрегиране + съгласие за индивидуалните карти.

---

## Препоръчителна последователност

1. **Първо — Phase 0 + „вертикален резрез" на въвеждането.** Първо схемата и каноничната батерия, после веднага минимална сесия + `AssessmentEntryGrid`, за да имаме реално работещ поток за въвеждане. *Защо:* без чисти данни нищо друго няма стойност, а ранен реален екран дава бърза обратна връзка от треньори.
2. **Второ — Phase 1 (scores + bridge към генератора) и Карта за развитие.** *Защо:* това е стойността за треньора и родителя и затваря методическата верига (диагноза → предписание). Това е, което създава adoption — затова идва преди федеративния надзор.
3. **Трето — Phase 3 (федеративно табло).** *Защо:* таблото става смислено едва след **поне 2 прозореца** реални данни (за делта и репери). По-рано би показвало празни/недостоверни плочки.
4. **Паралелно/непрекъснато — Phase 4 (governance).** Правата и заключването на сесии се правят още с endpoint-ите; формалното версиониране и съгласията се финализират **преди национален старт**.

> Накратко: **заснемане → стойност за състезателя → национален надзор**, с governance, преплетен през целия път и заключен преди публичното пускане.
