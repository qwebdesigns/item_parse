/* Вкладка "Сравнение": база (текущие данные или свой файл) vs новая версия handler.json. */
import { esc, fmt, countBy, debounce, notify, downloadCsv, download, loadItemsFromFile } from './core.js';
import { diffItems, summarizeDiff, fieldValueText, buildDiffRows } from './diff.js';
import { renderDiffCard, renderSummaryCard, showPhotoPreview, itemFilename } from './photo.js';
import { store } from './store.js';

const PAGE_SIZE = 40;
const $ = (id) => document.getElementById(id);

const el = {
  useCurrentBtn: $('useCurrentBtn'),
  currentCount: $('currentCount'),
  baseFileInput: $('baseFileInput'),
  baseSourceLabel: $('baseSourceLabel'),
  newFileInput: $('newFileInput'),
  newSourceLabel: $('newSourceLabel'),
  runCompare: $('runCompare'),
  results: $('compareResults'),
  stats: $('compareStats'),
  search: $('cSearch'),
  status: $('cStatus'),
  type: $('cType'),
  sort: $('cSort'),
  photoSummary: $('photoSummary'),
  exportCsv: $('exportDiffCsv'),
  exportJson: $('exportDiffJson'),
  count: $('cCount'),
  list: $('diffList'),
  more: $('cMore'),
};

const state = {
  base: null, // { items, source }
  next: null, // { items, source }
  diff: null,
  summary: null,
  entries: [],
  view: [],
  shown: PAGE_SIZE,
};

/* ---------- источники данных ---------- */

function refreshCurrentButton() {
  const n = store.items.length;
  el.currentCount.textContent = fmt(n);
  el.useCurrentBtn.disabled = n === 0;
  el.useCurrentBtn.title = n === 0 ? 'Сначала загрузите данные во вкладке «Каталог»' : '';
}

function setBase(items, source) {
  state.base = { items, source };
  el.baseSourceLabel.textContent = `Выбрано: ${source} · ${fmt(items.length)} предметов`;
  updateRunButton();
}

function setNext(items, source) {
  state.next = { items, source };
  el.newSourceLabel.textContent = `Выбрано: ${source} · ${fmt(items.length)} предметов`;
  updateRunButton();
}

function updateRunButton() {
  el.runCompare.disabled = !(state.base && state.next);
}

document.addEventListener('catalog:loaded', refreshCurrentButton);
refreshCurrentButton();

el.useCurrentBtn.addEventListener('click', () => {
  if (!store.items.length) return;
  setBase(store.items, `текущие данные (${store.source})`);
});

el.baseFileInput.addEventListener('change', async () => {
  const file = el.baseFileInput.files[0];
  if (!file) return;
  try {
    const { items, source } = await loadItemsFromFile(file);
    setBase(items, source);
  } catch (err) {
    notify(`Не удалось прочитать файл базы: ${err.message}`, 'error');
  }
});

el.newFileInput.addEventListener('change', async () => {
  const file = el.newFileInput.files[0];
  if (!file) return;
  try {
    const { items, source } = await loadItemsFromFile(file);
    setNext(items, source);
  } catch (err) {
    notify(`Не удалось прочитать файл новой версии: ${err.message}`, 'error');
  }
});

/* ---------- запуск сравнения ---------- */

el.runCompare.addEventListener('click', () => {
  if (!state.base || !state.next) return;
  try {
    state.diff = diffItems(state.base.items, state.next.items);
    state.summary = summarizeDiff(state.diff);
    state.entries = buildEntries(state.diff);
    fillTypeSelect();
    renderStats();
    el.results.hidden = false;
    el.photoSummary.disabled = false;
    applyFilters();
    notify('');
    el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    notify(`Ошибка сравнения: ${err.message}`, 'error');
  }
});

function buildEntries(diff) {
  return [...diff.added, ...diff.removed, ...diff.changed];
}

/* ---------- статистика ---------- */

function renderStats() {
  const d = state.diff;
  el.stats.innerHTML = `
    <div class="kpi"><b>${fmt(d.baseCount)}</b><span>было предметов</span></div>
    <div class="kpi"><b>${fmt(d.newCount)}</b><span>стало предметов</span></div>
    <div class="kpi c-added"><b>+${fmt(d.added.length)}</b><span>новых</span></div>
    <div class="kpi c-removed"><b>−${fmt(d.removed.length)}</b><span>удалено</span></div>
    <div class="kpi c-changed"><b>${fmt(d.changed.length)}</b><span>изменено</span></div>
    <div class="kpi"><b>${fmt(d.unchanged.length)}</b><span>без изменений</span></div>`;
}

function fillTypeSelect() {
  const types = countBy([...state.diff.added.map((e) => e.next), ...state.diff.removed.map((e) => e.old), ...state.diff.changed.map((e) => e.next)], 'type');
  el.type.innerHTML = `<option value="">Все типы</option>` + types.map(([t, c]) => `<option value="${esc(t)}">${esc(t)} (${fmt(c)})</option>`).join('');
}

/* ---------- фильтры ---------- */

function getFilters() {
  return { q: el.search.value.trim().toLowerCase(), status: el.status.value, type: el.type.value, sort: el.sort.value };
}

function matches(e, f) {
  const item = e.next || e.old;
  if (f.status && e.status !== f.status) return false;
  if (f.type && item.type !== f.type) return false;
  if (f.q) {
    const s = `${e.id} ${item.nameRu} ${item.nameEn}`.toLowerCase();
    if (!s.includes(f.q)) return false;
  }
  return true;
}

const SORTERS = {
  id: (a, b) => (Number(a.id) || 0) - (Number(b.id) || 0),
  magnitude: (a, b) => (b.magnitude || 0) - (a.magnitude || 0),
  name: (a, b) => (a.next || a.old).nameRu.localeCompare((b.next || b.old).nameRu, 'ru'),
};

const applyFilters = () => {
  try {
    const f = getFilters();
    state.view = state.entries.filter((e) => matches(e, f)).sort(SORTERS[f.sort] || SORTERS.id);
    state.shown = PAGE_SIZE;
    renderList();
  } catch (err) {
    console.error(err);
    notify(`Ошибка фильтрации сравнения: ${err.message}`, 'error');
  }
};
const refilter = debounce(applyFilters, 150);

el.search.addEventListener('input', refilter);
[el.status, el.type, el.sort].forEach((x) => x.addEventListener('change', applyFilters));

/* ---------- отображение списка отличий ---------- */

const STATUS_LABEL = { added: 'Новый предмет', removed: 'Предмет удалён', changed: 'Изменения' };

function statusBadgeHtml(status) {
  return `<span class="status-badge s-${status}">${esc(STATUS_LABEL[status])}</span>`;
}

function snapshotHtml(it) {
  return `
    <div class="tags">
      <span class="tag t-type">${esc(it.type)}</span>
      <span class="tag">${esc(it.category)}</span>
      <span class="tag">${esc(it.theme)}</span>
    </div>
    <div class="meta">
      <span>ур. ${it.minLvl ?? '—'}</span>
      <span>${fmt(it.cost)} зол.</span>
      <span>${esc(it.visible)}</span>
      ${it.upgradeCount ? `<span>улучшений: ${it.upgradeCount}</span>` : ''}
    </div>`;
}

function fieldRowHtml(f) {
  const dir = f.kind === 'number' ? f.dir : null;
  const cls = dir === 'up' ? 'v-up' : dir === 'down' ? 'v-down' : 'v-neutral';
  return `<div class="diff-row">
    <span class="diff-label">${esc(f.label)}</span>
    <span class="diff-value ${cls}">${esc(fieldValueText(f))}</span>
  </div>`;
}

function levelChangeHtml(lc) {
  if (lc.status === 'added') return `<li>добавлен уровень ${esc(lc.id)}: значение ${fmt(lc.next.value)}, цена ${fmt(lc.next.gold)} золота</li>`;
  if (lc.status === 'removed') return `<li>удалён уровень ${esc(lc.id)}</li>`;
  const bits = [];
  if (lc.value) bits.push(`значение <span class="${lc.value.dir === 'up' ? 'v-up' : 'v-down'}">${fmt(lc.value.old)} → ${fmt(lc.value.next)}</span>`);
  if (lc.gold) bits.push(`цена <span class="${lc.gold.dir === 'up' ? 'v-up' : 'v-down'}">${fmt(lc.gold.old)} → ${fmt(lc.gold.next)} золота</span>`);
  return `<li>уровень ${esc(lc.id)}: ${bits.join(', ')}</li>`;
}

function upgradeDiffHtml(u) {
  if (u.status === 'added') return `<div class="upg-diff upg-added">➕ Добавлено улучшение «${esc(u.name)}» (${u.next.levels.length} ур.)</div>`;
  if (u.status === 'removed') return `<div class="upg-diff upg-removed">➖ Удалено улучшение «${esc(u.name)}»</div>`;
  return `<div class="upg-diff"><b>«${esc(u.name)}»</b><ul>${u.levelChanges.map(levelChangeHtml).join('')}</ul></div>`;
}

function entryBodyHtml(e) {
  if (e.status === 'added') return snapshotHtml(e.next);
  if (e.status === 'removed') return `<p class="muted">Предмет отсутствует в новой версии файла.</p>${snapshotHtml(e.old)}`;
  const fields = e.fields.map(fieldRowHtml).join('') || '<p class="muted">Основные поля не изменились.</p>';
  const upgrades = e.upgrades.length ? `<div class="upg-diffs">${e.upgrades.map(upgradeDiffHtml).join('')}</div>` : '';
  return fields + upgrades;
}

function entryCardHtml(e) {
  const item = e.next || e.old;
  return `
    <article class="diff-card s-${e.status}" data-id="${esc(e.id)}">
      <header>
        ${statusBadgeHtml(e.status)}
        <h3>${esc(item.nameRu)} <span class="muted">#${esc(e.id)}</span></h3>
        <button class="btn ghost small photo-entry" data-id="${esc(e.id)}" type="button" title="Сделать фото этого изменения">📸</button>
      </header>
      <div class="diff-body">${entryBodyHtml(e)}</div>
    </article>`;
}

function renderList() {
  const total = state.view.length;
  const shown = Math.min(state.shown, total);
  el.list.innerHTML = state.view.slice(0, shown).map(entryCardHtml).join('');
  el.count.textContent = total ? `Показано ${fmt(shown)} из ${fmt(total)} отличий` : 'Отличий по заданным фильтрам не найдено.';
  el.more.hidden = shown >= total;
  const hasAny = state.entries.length > 0;
  el.exportCsv.disabled = !hasAny;
  el.exportJson.disabled = !hasAny;
}

el.more.addEventListener('click', () => {
  state.shown += PAGE_SIZE;
  renderList();
});

function entryById(id) {
  return state.entries.find((e) => e.id === id);
}

el.list.addEventListener('click', (e) => {
  const btn = e.target.closest('.photo-entry');
  if (!btn) return;
  const entry = entryById(btn.dataset.id);
  if (!entry) return;
  try {
    const canvas = renderDiffCard(entry, { left: `${state.base.source} → ${state.next.source}` });
    const item = entry.next || entry.old;
    showPhotoPreview(canvas, itemFilename(item, `diff_${entry.status}`));
  } catch (err) {
    console.error(err);
    notify(`Не удалось сделать фото изменения: ${err.message}`, 'error');
  }
});

el.photoSummary.addEventListener('click', () => {
  if (!state.diff) return;
  try {
    const canvas = renderSummaryCard(state.diff, state.summary, {
      title: 'Сводка обновления предметов',
      baseSource: state.base.source,
      newSource: state.next.source,
    });
    showPhotoPreview(canvas, 'update_summary.png');
  } catch (err) {
    console.error(err);
    notify(`Не удалось сделать итоговое фото: ${err.message}`, 'error');
  }
});

/* ---------- экспорт отличий ---------- */

el.exportCsv.addEventListener('click', () => {
  const head = ['ID', 'Статус', 'Название', 'Тип', 'Категория', 'Поле', 'Было', 'Стало'];
  const rows = buildDiffRows(state.view);
  downloadCsv('diff.csv', head, rows);
});

el.exportJson.addEventListener('click', () => {
  const clean = (e) => ({
    id: e.id,
    status: e.status,
    old: e.old ? { name: e.old.nameRu, type: e.old.type, category: e.old.category, cost: e.old.cost, minLvl: e.old.minLvl } : null,
    next: e.next ? { name: e.next.nameRu, type: e.next.type, category: e.next.category, cost: e.next.cost, minLvl: e.next.minLvl } : null,
    fields: e.fields || [],
    upgrades: e.upgrades || [],
  });
  download('diff.json', 'application/json', JSON.stringify(state.view.map(clean), null, 2));
});
