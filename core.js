/* Общие утилиты: экранирование, нормализация данных, разбор JSON, экспорт. */

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const txt = (v) => (v == null ? '' : String(v).trim());

export const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const fmt = (n) => (n == null ? '—' : n.toLocaleString('ru-RU'));

export const safeUrl = (u) => {
  if (!u) return '';
  try {
    const x = new URL(u, location.href);
    return /^https?:$/.test(x.protocol) ? x.href : '';
  } catch {
    return '';
  }
};

export const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export const countBy = (arr, key) => {
  const m = new Map();
  for (const x of arr) m.set(x[key], (m.get(x[key]) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export const initials = (it) => (it.nameEn || it.nameRu || '?').trim().charAt(0).toUpperCase();

/* Показывает сообщение в общей статусной строке (используется всеми вкладками). */
export function notify(msg, kind = 'info') {
  const box = document.getElementById('status');
  if (!box) return;
  box.hidden = !msg;
  box.className = `status ${kind}`;
  box.textContent = msg || '';
}

/* ---------- нормализация ---------- */

function normalizeUpgrade(u) {
  if (!u || typeof u !== 'object') return null;
  const levels = (Array.isArray(u.levels) ? u.levels : [])
    .map((l) => ({ id: txt(l?.id) || '0', value: num(l?.value), gold: num(l?.gold) ?? 0 }))
    .sort((a, b) => Number(a.id) - Number(b.id));
  return { id: txt(u.id), name: txt(u.name) || 'Без названия', levels };
}

export function normalizeItem(raw, idx) {
  if (!raw || typeof raw !== 'object') return null;
  const id = txt(raw.item_id) || `auto-${idx}`;
  const ru = txt(raw.item_name_ru);
  const en = txt(raw.item_name_en);
  const upgrades = (Array.isArray(raw.upgrades) ? raw.upgrades : [])
    .map(normalizeUpgrade)
    .filter(Boolean);
  const item = {
    id,
    nameRu: ru || en || `Предмет #${id}`,
    nameEn: en,
    icon: safeUrl(txt(raw.icon)),
    type: txt(raw.item_type?.name) || 'Без типа',
    category: txt(raw.item_category?.name) || 'Без категории',
    visible: txt(raw.item_visible?.name) || '—',
    theme: txt(raw.item_theme?.name) || '—',
    minLvl: num(raw.item_min_lvl),
    cost: num(raw.item_cost_gold),
    buyAmount: num(raw.item_buy_amount) ?? 1,
    upgrades,
    upgradeCount: upgrades.length,
  };
  item.search = [id, item.nameRu, en, item.type, item.category, item.theme].join(' ').toLowerCase();
  return item;
}

export function parseRaw(text) {
  const data = JSON.parse(text.replace(/^\uFEFF/, ''));
  const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
  if (!arr) throw new Error('в файле нет массива предметов');
  return arr;
}

/** Преобразует сырой массив из JSON в нормализованные предметы. Некорректные записи пропускаются. */
export function buildItems(rawArray) {
  const items = [];
  let skipped = 0;
  rawArray.forEach((r, i) => {
    const it = normalizeItem(r, i);
    if (it) items.push(it);
    else skipped++;
  });
  return { items, skipped };
}

/** Загружает и нормализует JSON-файл (File из input[type=file]). */
export async function loadItemsFromFile(file) {
  const raw = parseRaw(await file.text());
  const { items, skipped } = buildItems(raw);
  if (!items.length) throw new Error('не найдено ни одного корректного предмета');
  return { items, skipped, source: file.name };
}

/** Загружает и нормализует JSON по сетевому пути (например, handler.json рядом со страницей). */
export async function loadItemsFromUrl(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = parseRaw(await res.text());
  const { items, skipped } = buildItems(raw);
  if (!items.length) throw new Error('не найдено ни одного корректного предмета');
  return { items, skipped, source: url };
}

/* ---------- экспорт файлов ---------- */

export function download(name, mime, content) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const csvCell = (v) => {
  const s = String(v ?? '');
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(name, head, rows) {
  const body = [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  // BOM нужен, чтобы Excel правильно открыл кириллицу
  download(name, 'text/csv;charset=utf-8', '\uFEFF' + body);
}

export function slug(str) {
  return (
    txt(str)
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'item'
  );
}
