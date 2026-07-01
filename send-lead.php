<?php
/**
 * Центр содействия кандидатам — обработчик заявок для shared-хостинга (reg.ru).
 * Аналог server.js: валидация, honeypot, пересылка в n8n webhook, бэкап-лог.
 *
 * Форма (main.js) шлёт JSON на /api/lead → .htaccess перенаправляет сюда.
 * Настройки — в config.php (создаётся из config.example.php).
 *
 * Совместимо с PHP 7.4+.
 */

header('Content-Type: application/json; charset=utf-8');

// принимаем только POST
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

// --- конфиг ---
$cfgFile = __DIR__ . '/config.php';
$cfg = is_file($cfgFile) ? require $cfgFile : [];
$N8N_WEBHOOK_URL = $cfg['N8N_WEBHOOK_URL'] ?? '';
$LOG_FILE        = $cfg['LOG_FILE'] ?? (__DIR__ . '/../leads-csk.jsonl'); // по умолчанию вне docroot
$RL_MAX          = (int)($cfg['RATE_LIMIT_MAX'] ?? 8);      // запросов
$RL_WINDOW       = (int)($cfg['RATE_LIMIT_WINDOW'] ?? 60);  // секунд

// --- helpers ---
function client_ip() {
    foreach (['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $k) {
        if (!empty($_SERVER[$k])) {
            return trim(explode(',', $_SERVER[$k])[0]);
        }
    }
    return '';
}
function clean_str($s, $max = 500) {
    $s = is_string($s) ? $s : '';
    $s = preg_replace('/[\x00-\x1F\x7F]/', ' ', $s); // убрать управляющие символы (байтово — безопасно для UTF-8)
    $s = trim($s);
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}
function digits($s) { return preg_replace('/\D/', '', (string)$s); }
function slen($s) { return function_exists('mb_strlen') ? mb_strlen($s) : strlen($s); }

// --- разбор тела ---
$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    // на случай обычной form-urlencoded отправки
    $body = $_POST ?: [];
}

// --- honeypot: заполнено скрытое поле → бот ---
if (!empty($body['_gotcha'])) {
    echo json_encode(['ok' => true]);
    exit;
}

// --- валидация ---
$name  = clean_str($body['name'] ?? '', 120);
$phone = clean_str($body['phone'] ?? '', 40);
if (slen($name) < 2) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Укажите имя']);
    exit;
}
if (strlen(digits($phone)) !== 11) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Укажите корректный телефон']);
    exit;
}
if (empty($body['consent'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Требуется согласие на обработку данных']);
    exit;
}

// --- rate-limit (файловый, best-effort) ---
$ip = client_ip();
$rlFile = sys_get_temp_dir() . '/csk_rl_' . md5($ip);
$now = time();
$hits = [];
if (is_file($rlFile)) {
    $hits = array_filter(array_map('intval', explode(',', (string)@file_get_contents($rlFile))),
        function ($t) use ($now, $RL_WINDOW) { return $t > $now - $RL_WINDOW; });
}
if (count($hits) >= $RL_MAX) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'error' => 'Слишком много запросов. Попробуйте позже.']);
    exit;
}
$hits[] = $now;
@file_put_contents($rlFile, implode(',', $hits), LOCK_EX);

// --- сборка лида ---
$utm = (isset($body['utm']) && is_array($body['utm'])) ? $body['utm'] : [];
$lead = [
    'id'           => bin2hex(random_bytes(8)),
    'created_at'   => gmdate('c'),
    'name'         => $name,
    'phone'        => $phone,
    'city'         => clean_str($body['city'] ?? '', 120),
    'age'          => clean_str($body['age'] ?? '', 10),
    'position'     => clean_str($body['position'] ?? '', 120),
    'comment'      => clean_str($body['comment'] ?? '', 1000),
    'form'         => clean_str($body['form'] ?? '', 40),
    'page_url'     => clean_str($body['page_url'] ?? '', 300),
    'referrer'     => clean_str($body['referrer'] ?? '', 300),
    'utm_source'   => clean_str($utm['utm_source'] ?? '', 100),
    'utm_medium'   => clean_str($utm['utm_medium'] ?? '', 100),
    'utm_campaign' => clean_str($utm['utm_campaign'] ?? '', 100),
    'utm_term'     => clean_str($utm['utm_term'] ?? '', 100),
    'utm_content'  => clean_str($utm['utm_content'] ?? '', 100),
    'ip'           => $ip,
    'user_agent'   => clean_str($_SERVER['HTTP_USER_AGENT'] ?? '', 300),
];

// --- пересылка в n8n ---
$delivery = ['n8n' => 'skipped'];
if ($N8N_WEBHOOK_URL !== '') {
    $ch = curl_init($N8N_WEBHOOK_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($lead, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    $delivery['n8n'] = ($resp !== false && $code >= 200 && $code < 300)
        ? 'ok'
        : ('err:' . ($err !== '' ? $err : $code));
}

// --- бэкап-лог (чтобы не терять заявки, даже если n8n недоступен) ---
$record = $lead;
$record['delivery'] = $delivery;
@file_put_contents($LOG_FILE, json_encode($record, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);

// Всегда отвечаем успехом клиенту (заявка сохранена в лог в любом случае).
echo json_encode(['ok' => true]);
