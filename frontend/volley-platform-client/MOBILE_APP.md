# Мобилно приложение — Volley Coach BUL (родител + състезател)

Уеб линковете **остават непроменени**. Това приложение е допълнение за **всички клубове** в платформата (не е само за един клуб).

- Име на app-а: **Volley Coach BUL** (лого БФВ)
- Входна страница: https://volley-platform-bul.vercel.app/app  
- Родител: https://volley-platform.vercel.app/parent/login  
- Състезател: https://volley-platform.vercel.app/room/login  

Android app-ът е WebView към `/app` и **не** отваря Chrome.  
При проблем: деинсталирай старата версия (вкл. ако е пишело „Троян Волей“) и сложи най-новия APK.

Приложението отваря живия портал. Промени в родителския/състезателския уеб портал се виждат **без** ново APK.  
Промени само в треньор/админ **не** изискват ъпдейт на app-а.

---

## Android — файл за клубен сайт

Готов файл:

`frontend/volley-platform-client/mobile-release/volley-coach-bul-android.apk`

(същият файл се публикува и като `troyan-volley-portal-android.apk` за обратна съвместимост на стари линкове)

### За колегата на сайта

1. Качи `volley-coach-bul-android.apk` на хостинга.  
2. Бутон **„Свали за Android“**.  
3. Текст за родителите:
   - отвори линка от телефона (Chrome/Files, не от Messenger);
   - **Настройки → Приложения → Специален достъп → Инсталиране на неизвестни приложения** → разреши за Chrome/Files;
   - инсталирай от „Изтегляния“;
   - иконата е **Volley Coach BUL** с логото на БФВ.

### Повторно генериране на APK

```bash
cd frontend/volley-platform-client
npm ci
cd android && ./gradlew assembleRelease
# after signing — see scripts / previous release notes
```

---

## iPhone — App Store

Bundle id: `bg.volleycoach.portal`  
Име: **Volley Coach BUL**

1. Apple Developer акаунт.  
2. На Mac: `npx cap open ios` / Xcode проекта в `ios/App`.  
3. App Store Connect → Submit for Review.

---

## Важно

| Какво | Трябва ли ново app? |
|-------|---------------------|
| Промяна в треньор / админ | Не |
| Промяна в родителски / състезателски портал (уеб) | Обикновено не |
| Нова икона / native права / splash | Да |
