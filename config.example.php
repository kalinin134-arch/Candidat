<?php
/**
 * Конфигурация обработчика заявок (shared-хостинг).
 * Скопируйте этот файл в config.php и впишите свои значения:
 *     cp config.example.php config.php
 * config.php в репозиторий не коммитится (см. .gitignore).
 */

return [
    // Production-URL вашего Webhook-узла в n8n (метод POST).
    // Пример: https://n8n.ваш-домен.ру/webhook/csk-lead
    'N8N_WEBHOOK_URL' => '',

    // Куда писать бэкап-лог заявок. По умолчанию — на уровень выше docroot
    // (файл недоступен из браузера). При необходимости укажите свой путь.
    'LOG_FILE' => __DIR__ . '/../leads-csk.jsonl',

    // Анти-флуд: не более N заявок с одного IP за WINDOW секунд.
    'RATE_LIMIT_MAX'    => 8,
    'RATE_LIMIT_WINDOW' => 60,
];
