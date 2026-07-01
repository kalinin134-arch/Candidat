# Центр содействия кандидатам — сайт

Лендинг по службе по контракту (по всей России) + приём заявок с отправкой в **Bitrix24 через n8n**.

## Структура

```
.
├── index.html              # главная страница (лендинг)
├── privacy.html            # политика обработки ПД (152-ФЗ)
├── robots.txt / sitemap.xml
├── assets/
│   ├── css/styles.css      # все стили
│   ├── js/main.js          # маска телефона, валидация, отправка лида, UTM, модалка
│   └── img/                # логотип, фавикон, OG-обложка (SVG)
├── server/
│   ├── server.js           # Node/Express: статика + POST /api/lead
│   ├── package.json
│   └── .env.example        # шаблон конфигурации
└── deploy/
    ├── nginx.conf.example  # конфиг nginx (reverse proxy)
    └── csk.service         # systemd-юнит автозапуска
```

## Как заявка попадает в Bitrix24

```
Форма на сайте  ──POST /api/lead──►  Node-сервер  ──►  n8n webhook  ──►  Bitrix24 (ваш коннектор)
                                          │
                                          └──►  server/leads.jsonl  (бэкап-лог всех заявок)
```

Сервер шлёт лид в **n8n** (основной канал). В n8n настраиваете ноду Bitrix24 (создание лида).
Опционально можно слать **напрямую в Bitrix24** (входящий вебхук) — мимо n8n.
Любая заявка в любом случае пишется в `server/leads.jsonl`, чтобы ничего не потерялось.

Передаваемые поля: `name, phone, city, age, position, comment, utm_*, page_url, referrer, ip, user_agent, created_at`.

## Запуск локально

```bash
cd server
cp .env.example .env        # затем впишите N8N_WEBHOOK_URL
npm install
npm start                   # http://localhost:3000
```

Без заполненного `.env` сайт работает, форма принимает заявки и пишет их в `leads.jsonl`
(в консоли будет предупреждение, что канал доставки не настроен).

## Настройка n8n

1. В n8n создайте workflow с нодой **Webhook** (метод POST), скопируйте **Production URL**.
2. Вставьте его в `server/.env` → `N8N_WEBHOOK_URL`.
3. Добавьте ноду **Bitrix24 → Create Lead** (или HTTP Request к вашему вебхуку Bitrix24)
   и замапьте поля из JSON заявки на поля лида.

## Деплой на сервер (Ubuntu + nginx)

```bash
# 1. Установить Node 18+ (если нет)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx

# 2. Залить проект
sudo mkdir -p /var/www/csk
sudo cp -r ./* /var/www/csk/
cd /var/www/csk/server
sudo cp .env.example .env && sudo nano .env   # вписать N8N_WEBHOOK_URL
sudo npm install --omit=dev
sudo chown -R www-data:www-data /var/www/csk

# 3. Автозапуск через systemd
sudo cp /var/www/csk/deploy/csk.service /etc/systemd/system/csk.service
sudo systemctl daemon-reload
sudo systemctl enable --now csk
sudo systemctl status csk

# 4. nginx
sudo cp /var/www/csk/deploy/nginx.conf.example /etc/nginx/sites-available/csk
sudo nano /etc/nginx/sites-available/csk        # заменить example.ru на ваш домен
sudo ln -s /etc/nginx/sites-available/csk /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. HTTPS (бесплатный сертификат Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.ru -d www.example.ru
```

Просмотр логов сервиса: `journalctl -u csk -f`
Просмотр заявок: `tail -f /var/www/csk/server/leads.jsonl`

> Альтернатива systemd — `pm2`: `npm i -g pm2 && pm2 start server.js --name csk && pm2 save && pm2 startup`

## ⚠️ Что заменить перед публикацией (плейсхолдеры)

Найдите и замените по всем файлам:

| Плейсхолдер | Где | На что заменить |
|---|---|---|
| `8 (800) 000-00-00` / `+78000000000` | index.html, privacy.html, og-cover.svg | реальный телефон |
| `info@example.ru` | index.html, privacy.html | реальный e-mail |
| `example.ru` | index.html (canonical/og), robots.txt, sitemap.xml, privacy.html | ваш домен |
| `ИНН 0000000000`, `ОГРН 0000000000000` | index.html, privacy.html | реквизиты компании |
| ссылки соцсетей `href="#"` (TG/WA/VK) | index.html (футер) | ссылки на ваши соцсети/мессенджеры |
| `N8N_WEBHOOK_URL` | server/.env | URL вашего n8n webhook |

Суммы выплат в `index.html` приведены ориентировочно (на основе референса) и сопровождаются
дисклеймером. Сверьте их с актуальными условиями вашего региона/программы перед публикацией.

## Подключение аналитики (опционально)

`main.js` уже вызывает цели `lead` (Яндекс.Метрика) и `generate_lead` (GA4) при успешной отправке —
достаточно вставить счётчики Метрики/Google Analytics в `<head>` `index.html`.
