# Деплой на shared-хостинг reg.ru (Host-A) + n8n

Вариант без своего сервера: статика + PHP-обработчик формы → ваш n8n → Bitrix24.
Node-бэкенд из папки `server/` при этом **не нужен** (он для VPS-варианта).

## 1. Что загрузить в корень сайта (docroot)

Обычно docroot на reg.ru — это `~/site/контрактникам.com/public_html/` (или похожий путь
из панели). Загрузите туда по FTP / через «Файловый менеджер» ISPmanager:

```
index.html
privacy.html
consent.html
requisites.html
robots.txt
sitemap.xml
send-lead.php
config.php          ← создать из config.example.php (см. ниже), в репозитории его нет
.htaccess
assets/             ← вся папка (css, js, img)
```

НЕ загружайте: `server/`, `node_modules/`, `deploy/`, `README.md`, `.git/` — они не нужны на shared.

## 2. Настроить config.php

На сервере (или локально перед загрузкой) скопируйте шаблон и впишите URL вебхука n8n:

```bash
cp config.example.php config.php
```
```php
'N8N_WEBHOOK_URL' => 'https://n8n.ваш-домен.ру/webhook/csk-lead',
```

Лог заявок по умолчанию пишется в `../leads-csk.jsonl` (на уровень выше docroot — из браузера
недоступен). Это подстраховка: даже если n8n недоступен, заявка не потеряется.

## 3. Включить SSL

В панели reg.ru: раздел «SSL-сертификаты» → выпустить бесплатный Let's Encrypt на
контрактникам.com (и на `www`). После активации `.htaccess` сам редиректит http → https.

> Домен контрактникам.com — кириллический (IDN). Он автоматически работает и в
> punycode-виде (`xn--...`). SSL и хостинг это поддерживают, отдельных действий не требуется.

## 4. Проверить

Открыть `https://контрактникам.com`, отправить тестовую заявку. Должно прийти
«✓ Заявка отправлена». Проверить, что лид появился в Bitrix24 и строка добавилась в
`leads-csk.jsonl`.

Если форма не отправляется — проверьте в панели, что для сайта включён PHP и разрешены
исходящие соединения (cURL). На тарифах Host-A и выше это по умолчанию так.

---

# Настройка n8n (3 узла)

MCP-коннектор n8n — только для чтения, поэтому workflow создаём в интерфейсе n8n вручную.

### Узел 1 — Webhook
- **HTTP Method:** `POST`
- **Path:** `csk-lead` (итоговый Production-URL вида `https://n8n.ваш-домен/webhook/csk-lead`
  — его и вписать в `config.php`)
- **Respond:** `Using 'Respond to Webhook' node`

### Узел 2 — Bitrix24 → Create Lead
(нода Bitrix24, либо HTTP Request к входящему вебхуку Bitrix24 на метод `crm.lead.add`).
Маппинг полей из входящего JSON:

| Поле заявки (из PHP) | Поле лида Bitrix24 |
|---|---|
| `{{$json.name}}` | NAME (Имя) |
| `{{$json.phone}}` | PHONE → VALUE (тип MOBILE) |
| `{{$json.city}}` | ADDRESS_CITY / комментарий |
| `{{$json.age}}` | комментарий |
| `{{$json.position}}` | комментарий / своё поле |
| `{{$json.comment}}` | COMMENTS |
| `{{$json.utm_source}}` | UTM_SOURCE |
| `{{$json.utm_medium}}` | UTM_MEDIUM |
| `{{$json.utm_campaign}}` | UTM_CAMPAIGN |
| `{{$json.page_url}}` | SOURCE_DESCRIPTION |

TITLE лида можно задать статикой, напр. «Заявка с сайта (служба по контракту)».
SOURCE_ID — «WEB» или ваш источник.

### Узел 3 — Respond to Webhook
- **Response Code:** `200`
- **Response Body (JSON):** `{ "ok": true }`

Порядок: **Webhook → Bitrix24 → Respond to Webhook**. Активировать workflow (тумблер Active).

> Полный набор полей, которые шлёт форма: `name, phone, city, age, position, comment,
> form, page_url, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
> ip, user_agent, created_at`.
