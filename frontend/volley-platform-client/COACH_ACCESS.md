# Вход за треньори (iPhone / Android) — работещи линкове

## Каноничен линк (ползвай този)

**https://volley-platform-bul.vercel.app/login**

Алтернатива след деплой на Railway:

**https://volley-platform-production.up.railway.app/login**

## Важно правила

1. Отваряй в **Safari** или **Chrome**, не от Messenger / Facebook / Viber (там често е бял екран).  
2. Ако имаш активен разговор, на някои мрежи данните спират — пробвай след края на обаждането.  
3. При бял екран: бутон **„Обнови приложението“**, или Safari → изчисти данни за сайта и отвори пак.

## Какво беше счупено (оправено)

Railway SPA беше билднат с API към `http://127.0.0.1:8000`. На телефона това **никога** не работи (HTTPS страница → localhost).  
Сега API сочи към production Railway / same-origin, плюс по-сигурен boot на iPhone.
