/* Локальный прокси к API blockade3d.com — нужен кнопке «Загрузить из API».
 *
 * Зачем: сервер API отдаёт Access-Control-Allow-Origin только для своего домена,
 * поэтому браузер не даёт странице на localhost/LAN читать ответ напрямую (CORS).
 * Этот скрипт без зависимостей запрашивает API со стороны Node и отдаёт JSON
 * с разрешающими CORS-заголовками.
 *
 * Запуск:  node proxy.mjs        (или двойной клик по api-proxy.cmd)
 * Порт по умолчанию 8099, можно изменить:  PORT=9000 node proxy.mjs
 */
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.env.PORT) || 8099;
const ALLOWED_HOST = 'blockade3d.com';
const TIMEOUT_MS = 30000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Cache-Control': 'no-store',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...CORS, 'Content-Type': type });
  res.end(body);
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const target = url.searchParams.get('url');
  if (!target) {
    return send(res, 400, 'Нужен параметр url с адресом API', 'text/plain; charset=utf-8');
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return send(res, 400, 'Параметр url — не корректный адрес', 'text/plain; charset=utf-8');
  }
  if (targetUrl.hostname !== ALLOWED_HOST) {
    return send(res, 403, `Разрешён только ${ALLOWED_HOST}`, 'text/plain; charset=utf-8');
  }

  const started = Date.now();
  try {
    const api = await fetch(targetUrl, {
      headers: { 'User-Agent': 'item-catalog-proxy/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = Buffer.from(await api.arrayBuffer());
    const safeQuery = targetUrl.search.replace(/(PWD=)[^&]*/i, '$1***');
    console.log(`  ${api.status}  ${(body.length / 1024).toFixed(0)} КБ  ${Date.now() - started} мс  ${safeQuery}`);
    send(res, api.status, body, api.headers.get('content-type') || 'application/json; charset=utf-8');
  } catch (err) {
    const reason = err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'таймаут' : err?.message || String(err);
    console.error(`  ошибка запроса: ${reason}`);
    send(res, 502, `Не удалось получить данные из API: ${reason}`, 'text/plain; charset=utf-8');
  }
});

server.listen(PORT, () => {
  console.log(`\nПрокси к API ${ALLOWED_HOST} запущен:`);
  console.log(`  http://localhost:${PORT}/?url=<адрес API>`);
  for (const ip of lanAddresses()) console.log(`  http://${ip}:${PORT}/?url=<адрес API>`);
  console.log('\nОставьте это окно открытым и нажмите «Загрузить из API» на странице.');
  console.log('Остановить — Ctrl+C.\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} занят. Запустите на другом порту: PORT=8099 node proxy.mjs`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
