# Мобилно приложение — Троян Волей (родител + състезател)

Уеб линковете **остават непроменени**. Това приложение е допълнение.

- Входна страница в уеба: https://volley-platform.vercel.app/app  
- Родител (както досега): https://volley-platform.vercel.app/parent/login  
- Състезател (както досега): https://volley-platform.vercel.app/room/login  

Приложението отваря живия портал (`server.url`). Промени в родителския/състезателския уеб портал се виждат **без** ново APK.  
Промени само в треньор/админ **не** изискват ъпдейт на app-а.

---

## Android — файл за `troyanvolley.com`

Готов файл:

`frontend/volley-platform-client/mobile-release/troyan-volley-portal-android.apk`

### За колегата на сайта

1. Качи `troyan-volley-portal-android.apk` на хостинга.  
2. Добави бутон напр. **„Свали за Android“** с директен линк към файла.  
3. Кратък текст за родителите:
   - отвори линка от телефона (Chrome/Files, не от Messenger);
   - след сваляне: **Настройки → Приложения → Специален достъп → Инсталиране на неизвестни приложения** → разреши за Chrome/Files;
   - отвори APK-то от „Изтегляния“ и инсталирай;
   - ако пише „Приложението не бе инсталирано“ — почти винаги липсва горното разрешение; ако вече има стара версия, деинсталирай я и пробвай пак;
   - след инсталация отвори иконата **Троян Волей**.

### Повторно генериране на APK

```bash
cd frontend/volley-platform-client
npm ci
npx cap sync
cd android && ./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../mobile-release/troyan-volley-portal-android.apk
```

Нужни: JDK 21+, Android SDK (`ANDROID_HOME`).

---

## iPhone — App Store (кратко)

Apple **не позволява** нормално сваляне на `.ipa` от сайта като Android APK. За iPhone:

1. Регистрация в [Apple Developer](https://developer.apple.com) (~99 USD/година).  
2. На **Mac**: отвори проекта  
   `frontend/volley-platform-client/ios/App/App.xcodeproj`  
   (или `npx cap open ios`).  
3. В Xcode: Team / Signing с твоя Developer акаунт, Archive → Upload.  
4. В [App Store Connect](https://appstoreconnect.apple.com): име, икона, скрийншоти, privacy policy, Submit for Review.  
5. След одобрение: бутон на `troyanvolley.com` → „За iPhone (App Store)“.

Bundle id: `bg.troyanvolley.portal`  
Име: **Троян Волей**

---

## Важно

| Какво | Трябва ли ново app? |
|-------|---------------------|
| Промяна в треньор / админ | Не |
| Промяна в родителски / състезателски портал (уеб) | Обикновено не (app зарежда сайта) |
| Нова икона / native права / splash | Да — ново APK / нова версия в App Store |
