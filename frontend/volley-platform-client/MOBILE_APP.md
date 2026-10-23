# Мобилно приложение — Volley Coach BUL

Уеб линковете **остават непроменени**. App-ът е допълнение за **всички клубове**.

- Име: **Volley Coach BUL** (лого БФВ)
- Вход: https://volley-platform-bul.vercel.app/app  
  - Треньор → `/login`  
  - Родител → `/parent/login`  
  - Състезател → `/room/login`

Android: WebView към `/app`, без Chrome hand-off.  
При проблем: деинсталирай стара версия („Троян Волей“) и инсталирай най-новия APK.

**Сесия:** след вход акаунтът се запомня на устройството. При следващо отваряне app-ът отваря същия портал, докато не натиснете „Изход“.

**Push известия (важно за родители):** всички съществуващи типове (промяна/отмяна на тренировка, състезание, новина, платена/неплатена такса, чат в стаята) остават през същия сървър (VAPID Web Push).

В Android app-а бутонът **„Включи известия“** отваря **Chrome еднократно**, защото WebView няма PushManager. След включване в Chrome известията идват както досега — и докато ползвате app-а. Ако вече са били включени в Chrome, в app-а ще пише „Включени“.

Пълно native FCM/APNs (без Chrome) — виж `NATIVE_PUSH_SETUP.md` (Firebase + Apple).

**Ъпдейти:** промени в уеб портала (треньор / родител / състезател) се виждат **без** ново APK или App Store версия. Ново native build трябва само при икона, права, splash и подобни.

Подробно за iPhone: виж **[APPLE_APP_STORE.md](./APPLE_APP_STORE.md)**.

---

## Android — споделяне с колеги

Файл:

`frontend/volley-platform-client/mobile-release/volley-coach-bul-android.apk`

Директен линк (след push в `main`):

https://raw.githubusercontent.com/toli18/volley-platform/main/frontend/volley-platform-client/mobile-release/volley-coach-bul-android.apk

(старият файл `troyan-volley-portal-android.apk` сочи към същия билд за обратна съвместимост)

### За сайт / колеги

1. Качи APK-то или дай raw GitHub линка.  
2. Отвори от телефона (Chrome/Files, не Messenger).  
3. Разреши инсталация от неизвестни източници за Chrome/Files.  
4. Икона: **Volley Coach BUL** + БФВ.  
5. На началния екран: **Вход за треньор / родител / състезател**.

Ако колегата вече има инсталиран същия app: след деплой на уеба бутонът за треньор се появява **автоматично** при следващо отваряне (не е задължително да сваля APK отново). Ново APK е нужно само ако още ползва старата „Троян Волей“ обвивка.

### Повторно генериране на APK

```bash
cd frontend/volley-platform-client
npm ci
cd android && ./gradlew assembleRelease
# подписване с release keystore (виж предишни release notes)
```

---

## iPhone — App Store (колега с Apple Developer)

Виж **APPLE_APP_STORE.md** — стъпки за Developer акаунт, Xcode signing, App Store Connect, Archive/Upload и Review.

- Bundle ID: `bg.volleycoach.portal`  
- Име: **Volley Coach BUL**

---

## Важно

| Какво | Ново APK / App Store? |
|-------|------------------------|
| Нова функция в треньор / родител / състезател (уеб) | Не |
| Текст/бутони на `/app` (уеб) | Не |
| Икона / native права / splash | Да |
