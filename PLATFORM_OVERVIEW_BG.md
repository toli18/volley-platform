# Volley Coach Platform - описание на платформата и функционалности по роли

## 1) Какво представлява платформата

`Volley Coach Platform` е уеб платформа за управление на ежедневната работа на волейболните треньори, главните треньори и администраторите в клубна и федеративна структура.

Основната идея е в едно място да се обединят:

- планиране и изпълнение на тренировки;
- библиотека с упражнения и AI подпомагане;
- комуникация (форум, известия, статии);
- администриране на клубове и треньори;
- месечни такси и базови справки.

Платформата е разработена с ролеви достъп, така че всеки потребител вижда само функциите, които са релевантни за неговата позиция.

---

## 2) Роли в системата

### Треньор (`coach`)

Треньорът работи основно с оперативните модули:

- табло с най-важната информация за деня;
- създаване/редакция на тренировки;
- библиотека с упражнения и собствени упражнения;
- AI генератор за тренировки;
- отбори, присъствие и профили на състезатели;
- месечни такси;
- форум и статии.

Ключови екрани: [Начало](https://volley-platform.vercel.app/), [Моите тренировки](https://volley-platform.vercel.app/my-trainings), [AI Генератор](https://volley-platform.vercel.app/ai-generator), [Отбори](https://volley-platform.vercel.app/teams), [Месечни такси](https://volley-platform.vercel.app/monthly-fees), [Форум](https://volley-platform.vercel.app/forum), [Статии](https://volley-platform.vercel.app/articles).

### Главен треньор (`club_head_coach`)

Главният треньор има всички ключови възможности на треньор плюс:

- клубен dashboard (обобщени показатели за клуба);
- график на отборите;
- разпределяне и проследяване на тренировъчни задачи;
- известия от клубно ниво (вкл. за такси/отчети).

Ключови екрани: [Club Head Dashboard](https://volley-platform.vercel.app/club-head), [График на отборите](https://volley-platform.vercel.app/teams/schedule), [Задачи/Тренировки](https://volley-platform.vercel.app/my-trainings).

### Администратор (`platform_admin`, `federation_admin`)

Администраторът има контрол върху съдържанието и потребителите:

- административно табло;
- управление на упражнения (вкл. чакащи за одобрение);
- управление на треньори;
- управление на клубове;
- модериране на статии.

Ключови екрани: [Admin Dashboard](https://volley-platform.vercel.app/admin), [Админ упражнения](https://volley-platform.vercel.app/admin/drills), [Чакащи упражнения](https://volley-platform.vercel.app/admin/pending), [Треньори](https://volley-platform.vercel.app/admin/coaches), [Клубове](https://volley-platform.vercel.app/admin/clubs), [Статии](https://volley-platform.vercel.app/admin/articles).

---

## 3) Ключови модули и стойност за организацията

### A) Начално табло (Dashboard)

Дава бърз преглед на най-важното:

- предстоящ график;
- последни тренировки;
- активност от форум/статии;
- месечна мини статистика;
- индикатори за такси.

**Стойност:** намалява времето за ориентация и ускорява ежедневните решения.
Примерен екран: [Начало](https://volley-platform.vercel.app/)

### B) Тренировъчен процес

- създаване на тренировки;
- запазване като чернови;
- проследяване на изпълнение;
- детайлен изглед по тренировка;
- редакция и повторна употреба.

**Стойност:** стандартизира процеса и улеснява контрола върху качеството.
Примерни екрани: [Моите тренировки](https://volley-platform.vercel.app/my-trainings), [Детайл на тренировка](https://volley-platform.vercel.app/trainings/123)

### C) Упражнения + AI

- централен каталог;
- собствени упражнения на треньора;
- предложения чрез AI генератор;
- използване на упражнения в реални планове.

**Стойност:** спестява време и подпомага разнообразието и методиката.
Примерни екрани: [Каталог упражнения](https://volley-platform.vercel.app/drills), [AI Генератор](https://volley-platform.vercel.app/ai-generator)

### D) Отбори и присъствие

- списък и детайли на отбори;
- присъствие по тренировка;
- отчетни изгледи;
- профил на състезател.

**Стойност:** по-добра проследимост и отчетност към клуб/родители.
Примерни екрани: [Отбори](https://volley-platform.vercel.app/teams), [Присъствие](https://volley-platform.vercel.app/teams/1/attendance), [График](https://volley-platform.vercel.app/teams/schedule)

### E) Статии и форум

- публикуване и редакция на материали;
- коментиране и дискусии;
- нотификации за нова активност;
- административно модериране.

**Стойност:** централизира знание и комуникация в общността.
Примерни екрани: [Форум](https://volley-platform.vercel.app/forum), [Статии](https://volley-platform.vercel.app/articles)

### F) Месечни такси

- регистър на такси;
- статус платено/неплатено;
- известия и проследяване на движения.

**Стойност:** дава прозрачност и бърз финансов контрол на ниво клуб.
Примерен екран: [Месечни такси](https://volley-platform.vercel.app/monthly-fees)

---

## 4) Примерни екрани и линкове за поставяне на снимки

> Домейн на платформата: `https://volley-platform.vercel.app`

## 4.1 Публични/общи екрани

### 1. Вход
- URL: [https://volley-platform.vercel.app/login](https://volley-platform.vercel.app/login)
- Какво да се покаже на снимката: форма за вход, валидация, бутона за вход.
- Място за снимка: `[Добави screenshot - Login]`

### 2. Упражнения (публичен каталог)
- URL: [https://volley-platform.vercel.app/drills](https://volley-platform.vercel.app/drills)
- Какво да се покаже: списък упражнения, филтри/търсене (ако са налични), карта на упражнение.
- Място за снимка: `[Добави screenshot - Drills]`

---

## 4.2 Екрани за треньор

### 3. Coach Dashboard (Начало)
- URL: [https://volley-platform.vercel.app/](https://volley-platform.vercel.app/)
- Какво да се покаже: карти с график, последни тренировки, известия, статистика.
- Място за снимка: `[Добави screenshot - Coach Dashboard]`

### 4. Моите тренировки
- URL: [https://volley-platform.vercel.app/my-trainings](https://volley-platform.vercel.app/my-trainings)
- Какво да се покаже: списък с тренировки, статуси, навигация към детайл.
- Място за снимка: `[Добави screenshot - My Trainings]`

### 5. Детайл на тренировка
- URL (пример): [https://volley-platform.vercel.app/trainings/123](https://volley-platform.vercel.app/trainings/123)
- Какво да се покаже: структура на тренировка, блокове/упражнения, действия.
- Място за снимка: `[Добави screenshot - Training Details]`

### 6. AI генератор
- URL: [https://volley-platform.vercel.app/ai-generator](https://volley-platform.vercel.app/ai-generator)
- Какво да се покаже: входни параметри, генериран резултат, запазване.
- Място за снимка: `[Добави screenshot - AI Generator]`

### 7. Отбори
- URL: [https://volley-platform.vercel.app/teams](https://volley-platform.vercel.app/teams)
- Какво да се покаже: списък отбори и вход към детайли.
- Място за снимка: `[Добави screenshot - Teams]`

### 8. Присъствие на отбор
- URL (пример): [https://volley-platform.vercel.app/teams/1/attendance](https://volley-platform.vercel.app/teams/1/attendance)
- Какво да се покаже: маркиране на присъствие, запис, състояния.
- Място за снимка: `[Добави screenshot - Team Attendance]`

### 9. Месечни такси
- URL: [https://volley-platform.vercel.app/monthly-fees](https://volley-platform.vercel.app/monthly-fees)
- Какво да се покаже: таблица на плащания, филтри и статуси.
- Място за снимка: `[Добави screenshot - Monthly Fees]`

### 10. Форум
- URL: [https://volley-platform.vercel.app/forum](https://volley-platform.vercel.app/forum)
- Какво да се покаже: теми, действия за създаване/преглед.
- Място за снимка: `[Добави screenshot - Forum]`

### 11. Статии
- URL: [https://volley-platform.vercel.app/articles](https://volley-platform.vercel.app/articles)
- Какво да се покаже: списък статии, навигация към детайл.
- Място за снимка: `[Добави screenshot - Articles]`

---

## 4.3 Екрани за главен треньор

### 12. Club Head Dashboard
- URL: [https://volley-platform.vercel.app/club-head](https://volley-platform.vercel.app/club-head)
- Какво да се покаже: клубни KPI/справки и основни action бутони.
- Място за снимка: `[Добави screenshot - Club Head Dashboard]`

### 13. График на отборите
- URL: [https://volley-platform.vercel.app/teams/schedule](https://volley-platform.vercel.app/teams/schedule)
- Какво да се покаже: календар, събития, бързи действия.
- Място за снимка: `[Добави screenshot - Team Schedule]`

---

## 4.4 Екрани за администратор

### 14. Admin Dashboard
- URL: [https://volley-platform.vercel.app/admin](https://volley-platform.vercel.app/admin)
- Какво да се покаже: общи админ показатели и входове към секции.
- Място за снимка: `[Добави screenshot - Admin Dashboard]`

### 15. Админ упражнения
- URL: [https://volley-platform.vercel.app/admin/drills](https://volley-platform.vercel.app/admin/drills)
- Какво да се покаже: таблица с упражнения, действия за преглед/редакция.
- Място за снимка: `[Добави screenshot - Admin Drills]`

### 16. Чакащи упражнения
- URL: [https://volley-platform.vercel.app/admin/pending](https://volley-platform.vercel.app/admin/pending)
- Какво да се покаже: workflow по одобрение/отхвърляне.
- Място за снимка: `[Добави screenshot - Admin Pending Drills]`

### 17. Админ треньори
- URL: [https://volley-platform.vercel.app/admin/coaches](https://volley-platform.vercel.app/admin/coaches)
- Какво да се покаже: списък треньори, създаване/редакция.
- Място за снимка: `[Добави screenshot - Admin Coaches]`

### 18. Админ клубове
- URL: [https://volley-platform.vercel.app/admin/clubs](https://volley-platform.vercel.app/admin/clubs)
- Какво да се покаже: списък клубове, създаване/редакция.
- Място за снимка: `[Добави screenshot - Admin Clubs]`

### 19. Админ статии
- URL: [https://volley-platform.vercel.app/admin/articles](https://volley-platform.vercel.app/admin/articles)
- Какво да се покаже: всички статии и статуси.
- Място за снимка: `[Добави screenshot - Admin Articles]`

### 20. Чакащи статии
- URL: [https://volley-platform.vercel.app/admin/articles/pending](https://volley-platform.vercel.app/admin/articles/pending)
- Какво да се покаже: модерация и действия по публикации.
- Място за снимка: `[Добави screenshot - Admin Pending Articles]`

---

## 5) Примерен текст за представяне (готов за сайт/документ)

`Volley Coach Platform` е дигитална платформа за управление на тренировъчната и организационната дейност във волейболните клубове. Системата обединява в една среда планиране на тренировки, каталог с упражнения, AI подпомагане, управление на отбори и присъствие, финансов модул за месечни такси, както и вътрешна комуникация чрез форум и статии.

Функционалностите са ролево организирани: треньорите работят с оперативните модули за ежедневна подготовка, главните треньори имат разширен контрол на клубно ниво, а администраторите управляват съдържание, потребители и структури. Така платформата осигурява стандартизация на процесите, по-висока прозрачност и по-бързо вземане на решения във всички нива на организацията.

---

## 6) Бележки за използване в презентация

- Препоръчително е да използвате последователност: **Вход -> Dashboard -> Оперативни модули -> Админ контрол**.
- За всяка снимка добавете кратък caption от 1 изречение (каква стойност показва).
- Добра практика е да покажете поне по 2 екрана за всяка роля.

