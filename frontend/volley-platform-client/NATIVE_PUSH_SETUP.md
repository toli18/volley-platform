# Native push (Firebase + Apple) — по желание

Сегашният Android app ползва **същите** известия като уеба (VAPID Web Push):  
в app-а „Включи известия“ отваря Chrome еднократно. Това покрива график, такси, новини, чат.

Този документ е за следващата стъпка: известия **директно в app-а**, без Chrome.

## Android — Firebase Cloud Messaging

1. Създай проект в https://console.firebase.google.com  
2. Добави Android app с package `bg.volleycoach.portal`  
3. Свали `google-services.json` → сложи го в  
   `frontend/volley-platform-client/android/app/google-services.json`  
4. В `android/app/build.gradle` dependencies добави (ако още го няма):

```gradle
implementation platform('com.google.firebase:firebase-bom:33.7.0')
implementation 'com.google.firebase:firebase-messaging'
```

5. Service account: Firebase Console → Project settings → Service accounts → Generate new private key.  
6. Целия JSON сложи в Railway env: `FIREBASE_CREDENTIALS_JSON` (като един ред/string).  
7. Rebuild APK. В app-а „Включи известия“ ще запише `fcm:…` токен; сървърът праща през FCM.

Backend вече поддържа endpoint-и с префикс `fcm:`.

## iPhone — APNs

Заедно с App Store (виж `APPLE_APP_STORE.md`):

1. Apple Developer → Keys → Apple Push Notifications service (APNs)  
2. Качи ключа в Firebase (Cloud Messaging → Apple app configuration) или директно в backend  
3. Capacitor/Firebase Messaging на iOS + същото абониране към `/parent-portal/push/...`

## Какво остава същото

Типовете известия не се пипат — `notify_athlete` / parent_portal_notify продължават да пращат към всички абонаменти (Web Push и/или FCM).
