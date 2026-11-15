/* Скачивает данные предметов из API blockade3d.com и кладёт их в handler.json.
 *
 * Зачем: страница на GitHub Pages не может запросить API напрямую — сервер отдаёт
 * Access-Control-Allow-Origin только для своего домена (CORS). Поэтому данные
 * забирает GitHub Actions по расписанию (см. .github/workflows/update-data.yml)
 * и коммитит снимок в handler.json — страница читает его как обычный файл.
 *
 * Ручной запуск:  node scripts/fetch-data.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'handler.json');

const API_URL =
  'https://blockade3d.com/api_classic/handler.php?' +
  new URLSearchParams({
    NETWORK: '1',
    CMD: '2000',
    PWD: '2b984b3689f5f6f96d65357b6c93c042',
    API_VERSION: '2',
  }).toString();

const MIN_ITEMS = 100; // защита от пустого или обрезанного ответа
const ATTEMPTS = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchItems() {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(API_URL, {
        headers: { Accept: 'application/json', 'User-Agent': 'item_parse-data/1.0' },
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = JSON.parse((await res.text()).replace(/^\uFEFF/, ''));
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
      if (!items) throw new Error('в ответе нет массива предметов');
      return items;
    } catch (err) {
      lastError = err;
      console.warn(`попытка ${attempt}/${ATTEMPTS}: ${err.message}`);
      if (attempt < ATTEMPTS) await sleep(attempt * 5000);
    }
  }
  throw lastError;
}

async function previousText() {
  try {
    return await readFile(OUTPUT, 'utf8');
  } catch {
    return '';
  }
}

function countItems(text) {
  try {
    const data = JSON.parse(text.replace(/^\uFEFF/, ''));
    return Array.isArray(data) ? data.length : data?.items?.length || 0;
  } catch {
    return 0;
  }
}

const items = await fetchItems();

if (items.length < MIN_ITEMS) {
  console.error(`Отказ: в ответе всего ${items.length} предметов, ожидалось не меньше ${MIN_ITEMS}.`);
  process.exit(1);
}

const before = await previousText();
const beforeCount = countItems(before);
if (beforeCount && items.length < beforeCount * 0.5) {
  console.error(
    `Отказ: в прошлом снимке было ${beforeCount} предметов, сейчас ${items.length} — похоже на неполный ответ API.`
  );
  process.exit(1);
}

const body = JSON.stringify(items) + '\n';
const names = items
  .slice(0, 3)
  .map((i) => i?.item_name_ru || i?.item_name_en || i?.item_id)
  .join(', ');
console.log(`Получено предметов: ${items.length} (${names} …)`);

if (before === body) {
  console.log('Данные не изменились — handler.json не трогаем.');
  process.exit(0);
}

await writeFile(OUTPUT, body, 'utf8');
console.log(`handler.json обновлён: ${beforeCount} → ${items.length} предметов.`);
