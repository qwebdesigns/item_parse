/* Вкладка "Каталог": поиск, фильтры, сортировка, карточки, подробности, фото, экспорт. */
import { esc, fmt, num, countBy, debounce, initials, notify, downloadCsv, download, loadItemsFromFile, loadItemsFromUrl } from './core.js';
import { renderItemCard, showPhotoPreview, itemFilename } from './photo.js';
import { store } from './store.js';

const DATA_URL = 'handler.json';
const PAGE_SIZE = 48;

const $ = (id) => document.getElementById(id);
const el = {
  loader: $('loader'),
  fileInput: $('fileInput'),
  stats: $('stats'),
  filters: $('filters'),
  search: $('search'),
  type: $('fType'),
  category: $('fCategory'),
  visible: $('fVisible'),
  theme: $('fTheme'),
  minLvl: $('fMinLvl'),
  maxLvl: $('fMaxLvl'),
  upg: $('fUpgrades'),
  free: $('fFree'),
  sort: $('sort'),
  reset: $('reset'),
  count: $('count'),
  grid: $('grid'),
  more: $('more'),
  moreAll: $('moreAll'),
  viewCards: $('viewCards'),
  viewRows: $('viewRows'),
  exportCsv: $('exportCsv'),
  exportJson: $('exportJson'),
  updated: $('updated'),
  modal: $('modal'),
  modalBody: $('modalBody'),
  modalClose: $('modalClose'),
};

const state = { all: [], byId: new Map(), view: [], shown: PAGE_SIZE, mode: 'cards' };
let openItemId = null;

/* ---------- загрузка ---------- */

function showLoader(err) {
  el.loader.hidden = false;
  const fileHint =
    location.protocol === 'file:'
      ? ' Страница открыта как файл, и браузер не даёт читать соседние файлы автоматически.'
      : '';
  notify(`Не удалось загрузить ${DATA_URL} (${err.message}).${fileHint} Выберите файл вручную.`, 'warn');
}

el.fileInput.addEventListener('change', async () => {
  const file = el.fileInput.files[0];
  if (!file) return;
  try {
    const { items, skipped, source } = await loadItemsFromFile(file);
    init(items, skipped, source);
  } catch (err) {
    notify(`Файл не удалось прочитать: ${err.message}`, 'error');
  }
});

function init(items, skipped, source) {
  state.all = items;
  state.byId = new Map(items.map((i) => [i.id, i]));
  store.items = items;
  store.source = source;

  el.loader.hidden = true;
  el.updated.textContent =
    `Источник: ${source} · предметов: ${fmt(items.length)}` + (skipped ? ` · пропущено некорректных: ${skipped}` : '');

  fillSelects();
  renderStats();
  el.stats.hidden = false;
  el.filters.hidden = false;
  notify('');
  applyFilters();
  document.dispatchEvent(new CustomEvent('catalog:loaded'));
}

/* ---------- фильтры ---------- */

function fillSelect(sel, label, values) {
  sel.innerHTML =
    `<option value="">${esc(label)}</option>` +
    values.map(([v, c]) => `<option value="${esc(v)}">${esc(v)} (${fmt(c)})</option>`).join('');
}

function fillSelects() {
  fillSelect(el.type, 'Все типы', countBy(state.all, 'type'));
  fillSelect(el.category, 'Все категории', countBy(state.all, 'category'));
  fillSelect(el.visible, 'Любая доступность', countBy(state.all, 'visible'));
  fillSelect(el.theme, 'Любая тема', countBy(state.all, 'theme'));
}

function getFilters() {
  return {
    q: el.search.value.trim().toLowerCase(),
    type: el.type.value,
    category: el.category.value,
    visible: el.visible.value,
    theme: el.theme.value,
    min: num(el.minLvl.value),
    max: num(el.maxLvl.value),
    upg: el.upg.checked,
    free: el.free.checked,
    sort: el.sort.value,
  };
}

function matches(it, f) {
  if (f.q && !it.search.includes(f.q)) return false;
  if (f.type && it.type !== f.type) return false;
  if (f.category && it.category !== f.category) return false;
  if (f.visible && it.visible !== f.visible) return false;
  if (f.theme && it.theme !== f.theme) return false;
  if (f.min != null && (it.minLvl == null || it.minLvl < f.min)) return false;
  if (f.max != null && (it.minLvl == null || it.minLvl > f.max)) return false;
  if (f.upg && !it.upgradeCount) return false;
  if (f.free && it.cost !== 0) return false;
  return true;
}

const SORTERS = {
  id: (a, b) => (num(a.id) ?? 0) - (num(b.id) ?? 0),
  name: (a, b) => a.nameRu.localeCompare(b.nameRu, 'ru'),
  'cost-asc': (a, b) => (a.cost ?? 0) - (b.cost ?? 0),
  'cost-desc': (a, b) => (b.cost ?? 0) - (a.cost ?? 0),
  'lvl-asc': (a, b) => (a.minLvl ?? 0) - (b.minLvl ?? 0),
  'lvl-desc': (a, b) => (b.minLvl ?? 0) - (a.minLvl ?? 0),
  'upg-desc': (a, b) => b.upgradeCount - a.upgradeCount,
};

function applyFilters() {
  try {
    const f = getFilters();
    state.view = state.all.filter((it) => matches(it, f)).sort(SORTERS[f.sort] || SORTERS.id);
    state.shown = PAGE_SIZE;
    renderGrid();
  } catch (err) {
    console.error(err);
    notify(`Ошибка фильтрации: ${err.message}`, 'error');
  }
}

/* ---------- отображение ---------- */

function renderStats() {
  const all = state.all;
  const paid = all.filter((i) => i.cost > 0);
  const avg = paid.length ? Math.round(paid.reduce((s, i) => s + i.cost, 0) / paid.length) : 0;
  const withUpg = all.filter((i) => i.upgradeCount).length;
  const free = all.filter((i) => i.cost === 0).length;
  const byType = countBy(all, 'type');
  const max = byType[0]?.[1] || 1;

  el.stats.innerHTML = `
    <div class="kpi"><b>${fmt(all.length)}</b><span>предметов</span></div>
    <div class="kpi"><b>${fmt(withUpg)}</b><span>с улучшениями</span></div>
    <div class="kpi"><b>${fmt(free)}</b><span>бесплатных</span></div>
    <div class="kpi"><b>${fmt(avg)}</b><span>средняя цена, золото</span></div>
    <div class="bars">
      ${byType
        .map(
          ([k, v]) => `
        <div class="bar-row" data-type="${esc(k)}" title="Показать только этот тип">
          <span>${esc(k)}</span>
          <div class="bar"><i style="width:${((v / max) * 100).toFixed(1)}%"></i></div>
          <b>${fmt(v)}</b>
        </div>`
        )
        .join('')}
    </div>`;
}

function cardHtml(it) {
  const img = it.icon ? `<img src="${esc(it.icon)}" alt="" loading="lazy" decoding="async">` : '';
  return `
    <article class="card" data-id="${esc(it.id)}" tabindex="0">
      <div class="ico">${img}<span class="ph">${esc(initials(it))}</span></div>
      <div class="cbody">
        <h3>${esc(it.nameRu)}</h3>
        ${it.nameEn ? `<div class="en">${esc(it.nameEn)}</div>` : ''}
        <div class="tags">
          <span class="tag t-type">${esc(it.type)}</span>
          <span class="tag">${esc(it.category)}</span>
        </div>
        <div class="meta">
          <span title="Минимальный уровень">ур. ${it.minLvl ?? '—'}</span>
          <span title="Цена в золоте">${fmt(it.cost)} зол.</span>
          ${it.upgradeCount ? `<span title="Количество улучшений">улучшений: ${it.upgradeCount}</span>` : ''}
        </div>
      </div>
    </article>`;
}

const ROW_HEAD = `
  <div class="row-head">
    <span></span>
    <span>Название</span>
    <span class="hide-m">Тип</span>
    <span class="hide-m">Категория</span>
    <span class="r-num">Ур.</span>
    <span class="r-num">Цена</span>
    <span class="r-num hide-m">Улучш.</span>
  </div>`;

function rowHtml(it) {
  const img = it.icon ? `<img src="${esc(it.icon)}" alt="" loading="lazy" decoding="async">` : '';
  return `
    <article class="card row" data-id="${esc(it.id)}" tabindex="0">
      <div class="ico">${img}<span class="ph">${esc(initials(it))}</span></div>
      <div class="r-name">
        <b>${esc(it.nameRu)}</b>
        ${it.nameEn ? `<span class="en">${esc(it.nameEn)}</span>` : ''}
      </div>
      <span class="tag t-type hide-m">${esc(it.type)}</span>
      <span class="tag hide-m">${esc(it.category)}</span>
      <span class="r-num">${it.minLvl ?? '—'}</span>
      <span class="r-num">${fmt(it.cost)}</span>
      <span class="r-num hide-m">${it.upgradeCount || '—'}</span>
    </article>`;
}

function setMode(mode) {
  state.mode = mode;
  const isRows = mode === 'rows';
  el.viewCards.classList.toggle('active', !isRows);
  el.viewRows.classList.toggle('active', isRows);
  el.viewCards.setAttribute('aria-pressed', String(!isRows));
  el.viewRows.setAttribute('aria-pressed', String(isRows));
  renderGrid();
}

function renderGrid() {
  try {
    const total = state.view.length;
    const shown = Math.min(state.shown, total);
    const isRows = state.mode === 'rows';
    const itemsHtml = state.view.slice(0, shown).map(isRows ? rowHtml : cardHtml).join('');

    el.grid.classList.toggle('rows', isRows);
    el.grid.innerHTML = (isRows && total ? ROW_HEAD : '') + itemsHtml;

    el.count.textContent = total ? `Показано ${fmt(shown)} из ${fmt(total)}` : 'Ничего не найдено. Попробуйте сбросить фильтры.';

    const hasMore = shown < total;
    el.more.hidden = !hasMore;
    el.moreAll.hidden = !hasMore;
    el.more.textContent = `Показать ещё ${PAGE_SIZE}`;
    el.moreAll.textContent = `Показать все (ещё ${fmt(total - shown)})`;

    el.exportCsv.disabled = total === 0;
    el.exportJson.disabled = total === 0;
  } catch (err) {
    console.error(err);
    notify(`Ошибка отображения: ${err.message}`, 'error');
  }
}

/* ---------- модальное окно ---------- */

function detailHtml(it) {
  const icon = it.icon ? `<img class="big" src="${esc(it.icon)}" alt="" referrerpolicy="no-referrer">` : `<div class="big ph">${esc(initials(it))}</div>`;
  const facts = [
    ['ID', it.id],
    ['Название (EN)', it.nameEn || '—'],
    ['Тип', it.type],
    ['Категория', it.category],
    ['Доступность', it.visible],
    ['Тема', it.theme],
    ['Мин. уровень', it.minLvl ?? '—'],
    ['Цена, золото', fmt(it.cost)],
    ['Количество за покупку', it.buyAmount],
  ];

  const upgrades = it.upgrades.length
    ? it.upgrades
        .map((u) => {
          let total = 0;
          const rows = u.levels
            .map((l) => {
              total += l.gold;
              return `<tr><td>${esc(l.id)}</td><td>${fmt(l.value)}</td><td>${fmt(l.gold)}</td><td>${fmt(total)}</td></tr>`;
            })
            .join('');
          return `
            <section class="upg">
              <h4>${esc(u.name)} <small>${u.levels.length} ур.</small></h4>
              <div class="tablewrap">
                <table>
                  <thead><tr><th>Ур.</th><th>Значение</th><th>Цена ур.</th><th>Всего золота</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </section>`;
        })
        .join('')
    : '<p class="muted">Улучшений нет.</p>';

  return `
    <header class="mhead">
      ${icon}
      <div>
        <h2 id="modalTitle">${esc(it.nameRu)}</h2>
        ${it.nameEn ? `<p class="en">${esc(it.nameEn)}</p>` : ''}
      </div>
    </header>
    <div class="modal-actions">
      <button id="modalPhoto" class="btn ghost" type="button">📸 Сделать фото предмета</button>
    </div>
    <dl class="facts">
      ${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
    </dl>
    <h3>Улучшения</h3>
    ${upgrades}`;
}

function openModal(id) {
  const it = state.byId.get(id);
  if (!it) return;
  try {
    openItemId = id;
    el.modalBody.innerHTML = detailHtml(it);
    if (!el.modal.open) el.modal.showModal();
  } catch (err) {
    console.error(err);
    notify(`Не удалось открыть предмет: ${err.message}`, 'error');
  }
}

el.modalBody.addEventListener('click', (e) => {
  if (!e.target.closest('#modalPhoto')) return;
  const it = state.byId.get(openItemId);
  if (!it) return;
  try {
    const canvas = renderItemCard(it, { source: store.source });
    showPhotoPreview(canvas, itemFilename(it, 'item'));
  } catch (err) {
    console.error(err);
    notify(`Не удалось сделать фото: ${err.message}`, 'error');
  }
});

/* ---------- события ---------- */

const refilter = debounce(applyFilters, 150);

el.search.addEventListener('input', refilter);
[el.minLvl, el.maxLvl].forEach((x) => x.addEventListener('input', refilter));
[el.type, el.category, el.visible, el.theme, el.sort, el.upg, el.free].forEach((x) => x.addEventListener('change', applyFilters));

el.reset.addEventListener('click', () => {
  el.search.value = '';
  [el.type, el.category, el.visible, el.theme].forEach((s) => (s.value = ''));
  el.sort.value = 'id';
  el.minLvl.value = '';
  el.maxLvl.value = '';
  el.upg.checked = false;
  el.free.checked = false;
  applyFilters();
});

el.more.addEventListener('click', () => {
  state.shown += PAGE_SIZE;
  renderGrid();
});

el.moreAll.addEventListener('click', () => {
  state.shown = state.view.length;
  renderGrid();
});

el.viewCards.addEventListener('click', () => setMode('cards'));
el.viewRows.addEventListener('click', () => setMode('rows'));

el.grid.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) openModal(card.dataset.id);
});
el.grid.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('card')) {
    e.preventDefault();
    openModal(e.target.dataset.id);
  }
});

el.stats.addEventListener('click', (e) => {
  const row = e.target.closest('[data-type]');
  if (!row) return;
  el.type.value = row.dataset.type;
  applyFilters();
  el.grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.addEventListener(
  'error',
  (e) => {
    if (e.target.tagName === 'IMG') e.target.classList.add('broken');
  },
  true
);

el.modalClose.addEventListener('click', () => el.modal.close());
el.modal.addEventListener('click', (e) => {
  if (e.target === el.modal) el.modal.close();
});

el.exportCsv.addEventListener('click', () => {
  const head = ['ID', 'Название RU', 'Название EN', 'Тип', 'Категория', 'Доступность', 'Тема', 'Мин. уровень', 'Цена', 'Улучшений'];
  const rows = state.view.map((i) => [i.id, i.nameRu, i.nameEn, i.type, i.category, i.visible, i.theme, i.minLvl, i.cost, i.upgradeCount]);
  downloadCsv('items.csv', head, rows);
});

el.exportJson.addEventListener('click', () => {
  const data = state.view.map((i) => ({
    id: i.id,
    name_ru: i.nameRu,
    name_en: i.nameEn,
    type: i.type,
    category: i.category,
    visible: i.visible,
    theme: i.theme,
    min_lvl: i.minLvl,
    cost_gold: i.cost,
    upgrades: i.upgrades,
  }));
  download('items.json', 'application/json', JSON.stringify(data, null, 2));
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !el.modal.open && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault();
    el.search.focus();
  }
});

/* ---------- старт ---------- */

export async function boot() {
  try {
    const { items, skipped, source } = await loadItemsFromUrl(DATA_URL);
    init(items, skipped, source);
  } catch (err) {
    console.warn('[catalog] автозагрузка не удалась:', err);
    showLoader(err);
  }
}
