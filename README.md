# qvabo-webapp
## Kling 4.0: k4-logic.js (28.10.2026)

Правила Kling 4.0 (лимиты, причина блокировки, метки, сборка персонажей) собираются из файла сайта, чтобы у сайта, Mini App и ноды K4 Prep бота был один код. Руками `k4-logic.js` не править, пересобрать из `qvabolanding/web`:

```bash
node_modules/.bin/esbuild lib/cabinet/kling4-pult.ts --bundle --format=iife --global-name=K4Logic --target=es2018 --outfile=<путь>/github-fresh/k4-logic.js
```

Панель материалов — `k4.js` (window.K4MiniApp), проверка пути человека и прогон заказа через K4 Prep — `qvabo-studio/typed/show-k4-miniapp.cjs`.
