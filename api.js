/* Загрузка данных напрямую из API blockade3d.com (режим «Загрузить из API»).
 *
 * Особенность сервера: заголовок Access-Control-Allow-Origin он отдаёт только
 * для своего домена, поэтому обычный fetch со страницы на localhost/LAN
 * браузер блокирует (CORS). Чтобы кнопка работала в любом окружении, пробуем
 * несколько маршрутов по очереди:
 *   1) прокси на том же адресе, что и страница (…/api/handler.php) —
 *      работает, если настроен реверс-прокси или liveServer.settings.proxy;
 *   2) локальный прокси из проекта (proxy.mjs, порт 8099) —
 *      основной вариант для локальной разработки;
 *   3) прямой запрос к API — сработает, если страница открыта на blockade3d.com.
 * Удачный маршрут запоминается в sessionStorage и в следующий раз пробуется первым.
 */
import { buildItems, parseRaw } from './core.js';

export const API = {
  host: 'blockade3d.com',
  path: '/api_classic/handler.php',
  params: {
    NETWORK: '1',
    CMD: '2000',
    PWD: '2b984b3689f5f6f96d65357b6c93c042',
    API_VERSION: '2',
  },
  proxyPort: 8099,
  timeout: 30000,
};

export const API_QUERY = new URLSearchParams(API.params).toString();
export const API_URL = `https://${API.host}${API.path}?${API_QUERY}`;

const REMEMBER_KEY = 'catalog.api-route';

/** Адрес локального прокси (proxy.mjs). Для https-страницы он недоступен: mixed content. */
function proxyUrl() {
  const { protocol, hostname } = location;
  if (protocol !== 'http:' || !hostname) return '';
  return `${protocol}//${hostname}:${API.proxyPort}/?url=${encodeURIComponent(API_URL)}`;
}

/** Порядок попыток: сначала тот маршрут, который уже срабатывал. */
function buildRoutes() {
  const list = [];

  if (location.protocol !== 'file:') {
    list.push({ id: 'origin', label: 'прокси на локальном сервере', url: `api/handler.php?${API_QUERY}` });
  }

  const proxy = proxyUrl();
  if (proxy) list.push({ id: 'proxy', label: `локальный прокси (порт ${API.proxyPort})`, url: proxy });

  list.push({ id: 'direct', label: 'напрямую', url: API_URL });

  let remembered = '';
  try {
    remembered = sessionStorage.getItem(REMEMBER_KEY) || '';
  } catch {
    /* приватный режим — просто не запоминаем */
  }
  if (!remembered) return list;
  return [...list.filter((r) => r.id === remembered), ...list.filter((r) => r.id !== remembered)];
}

function rememberRoute(id) {
  try {
    sessionStorage.setItem(REMEMBER_KEY, id);
  } catch {
    /* не критично */
  }
}

async function fetchRaw(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API.timeout);
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const head = text.trimStart().charAt(0);
    // прокси или статический сервер могут вернуть HTML-страницу вместо JSON
    if (head !== '[' && head !== '{') throw new Error('ответ не похож на JSON');
    return parseRaw(text);
  } finally {
    clearTimeout(timer);
  }
}

/** Понятное описание сетевой ошибки: браузер отдаёт только «Failed to fetch». */
function describeError(err, route) {
  if (err?.name === 'AbortError') return 'таймаут';
  const msg = err?.message || String(err);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return route.id === 'proxy' ? 'прокси не запущен' : 'нет сети или запрос заблокирован (CORS)';
  }
  return msg;
}

function failureMessage(errors) {
  const how =
    location.protocol === 'https:'
      ? 'Откройте страницу по http на локальном сервере и запустите прокси «node proxy.mjs», либо положите handler.json рядом со страницей.'
      : 'Запустите локальный прокси: «node proxy.mjs» (или api-proxy.cmd в папке проекта) и нажмите кнопку ещё раз.';
  return (
    `Не удалось загрузить данные из API ${API.host}. ` +
    'Сервер отдаёт JSON только своим доменам (CORS), поэтому из браузера нужен посредник. ' +
    `${how} Попытки — ${errors.join('; ')}.`
  );
}

/** Загружает и нормализует предметы из API. Бросает Error с понятным текстом, если не вышло. */
export async function loadItemsFromApi() {
  const routes = buildRoutes();
  const errors = [];

  for (const route of routes) {
    try {
      const raw = await fetchRaw(route.url);
      const { items, skipped } = buildItems(raw);
      if (!items.length) throw new Error('в ответе нет предметов');
      rememberRoute(route.id);
      return { items, skipped, route, source: `API ${API.host} · ${route.label}` };
    } catch (err) {
      errors.push(`${route.label}: ${describeError(err, route)}`);
    }
  }

  throw new Error(failureMessage(errors));
}
