# iPhone / App Store — ръководство за колега (Apple Developer)

Този документ е за човек с **Mac** и достъп до **Apple Developer**, който ще качи **Volley Coach BUL** в App Store.

Проектът вече е подготвен в репото:

- Папка: `frontend/volley-platform-client/ios/App`
- Bundle ID: `bg.volleycoach.portal`
- Display name: **Volley Coach BUL**
- Икона: БФВ (в `Assets.xcassets/AppIcon.appiconset`)
- App-ът отваря живия сайт чрез Capacitor `server.url`:  
  `https://volley-platform-bul.vercel.app/app`  
  (треньор / родител / състезател — бутони на екрана)
- Маркетинг версия в Xcode: **1.2.0** (build 2) — можеш да я качиш при първия upload

Уеб линковете остават; това е допълнителен начин за вход от iPhone.

---

## Какво трябва преди старт

1. **Apple Developer Program** (платен годишен акаунт) — организация или индивидуален.  
   Регистрация: https://developer.apple.com/programs/  
2. **Mac** с последен **Xcode** от App Store.  
3. Достъп до GitHub репото `toli18/volley-platform` (клон `main`).  
4. Решен въпрос: акаунтът на коя организация е (клуб / федерация / фирма) — Apple го показва като издател в App Store.

---

## Стъпки (накратко)

### 1) Клонирай проекта

```bash
git clone https://github.com/toli18/volley-platform.git
cd volley-platform/frontend/volley-platform-client
npm ci
npx cap sync ios
npx cap open ios
```

Отваря се Xcode с проекта `App`.

### 2) Signing в Xcode

1. Избери target **App**.  
2. **Signing & Capabilities** → сложи своя **Team** (Apple Developer).  
3. Bundle Identifier трябва да е `bg.volleycoach.portal`.  
   Ако ID-то е заето, създай същото в [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) или се свържи с нас преди смяна.  
4. Увери се, че има **App ID** + provisioning (Xcode обикновено ги създава автоматично с „Automatically manage signing“).

### 3) App Store Connect

1. Влез в https://appstoreconnect.apple.com  
2. **My Apps → +** → New App  
3. Попълни:
   - Platform: iOS  
   - Name: **Volley Coach BUL**  
   - Primary Language: Bulgarian (или English)  
   - Bundle ID: `bg.volleycoach.portal`  
   - SKU: напр. `volley-coach-bul-001`  
4. Подготви метаданни (може и чернова):
   - Кратко описание: мобилен вход към Volley Coach BUL за треньори, родители и състезатели.  
   - Категория: Sports / Education  
   - Privacy Policy URL (задължително) — страница от сайта/платформата с политика за поверителност.  
   - Възраст / content rights според реалното съдържание.  
5. **Screenshots**: нужни са снимки от iPhone (размерите ги показва App Store Connect). Можеш да снимаш симулатор или реален телефон с отворен `/app` и login екрани.

### 4) Archive и Upload

В Xcode:

1. Device: **Any iOS Device (arm64)** (не симулатор).  
2. **Product → Archive**.  
3. Organizer → **Distribute App → App Store Connect → Upload**.  
4. Изчакай обработката в App Store Connect (минути–час).

### 5) Submit for Review

1. В App Store Connect избери качената build версия.  
2. Попълни **App Review Information** (демо акаунт треньор / родител ако Apple поиска вход).  
3. **Submit for Review**.  
4. Одобрението от Apple обикновено отнема 1–3 дни (варира).

---

## Важно за ъпдейтите след публикация

| Какво променяме | Трябва ли нова версия в App Store? |
|-----------------|-------------------------------------|
| Нови функции в треньорския / родителския / състезателския **уеб** портал | **Не** — app-ът зарежда живия сайт |
| Смяна само на текстове/бутони на `/app` (уеб) | **Не** |
| Нова икона, splash, native права (камера, push…), смяна на Bundle ID | **Да** — нова Archive + Submit |

Тоест колегите треньори ще виждат новите функции без да чакат App Store, докато промяната е в уеба.

---

## Контакти / данни за review (попълни преди submit)

- Support URL: ________________  
- Privacy Policy URL: ________________  
- Demo coach email / password (само за Apple Review): ________________  
- Contact phone for App Review: ________________  

---

## Android (за сравнение)

Android APK се сваля от сайта без магазин:

https://raw.githubusercontent.com/toli18/volley-platform/main/frontend/volley-platform-client/mobile-release/volley-coach-bul-android.apk

iPhone **не** позволява същото публично sideload за обикновени потребители — затова минаваме през App Store.
