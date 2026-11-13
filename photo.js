/* Фоторежим: рисуем карточки на <canvas> и отдаём готовый PNG 1720×1280.
 * Иконки предметов намеренно не используются (они с внешнего домена и может
 * не быть CORS — это испортило бы экспорт), вместо них — цветная буква-плашка
 * по типу предмета. Все размеры даны в CSS-пикселях самого канваса. */
import { fmt, esc, slug, notify } from './core.js';
import { fieldValueText } from './diff.js';

export const W = 1720;
export const H = 1280;

const BG = '#0f1115';
const PANEL = '#171a21';
const PANEL2 = '#1e222b';
const LINE = '#2a2f3a';
const TEXT = '#e7eaf0';
const MUTED = '#8b93a7';
const GOLD = '#f0b429';
const GREEN = '#3ecf8e';
const RED = '#ef5350';
const BLUE = '#4fa3ff';
const YELLOW = '#ffd400';

const STATUS_COLOR = { added: YELLOW, removed: RED, changed: BLUE };
const STATUS_LABEL = { added: 'НОВЫЙ ПРЕДМЕТ', removed: 'ПРЕДМЕТ УДАЛЁН', changed: 'ИЗМЕНЕНИЯ' };

const MARGIN = 36;
const CARD_X = MARGIN;
const CARD_Y = MARGIN;
const CARD_W = W - MARGIN * 2;
const CARD_H = H - MARGIN * 2;
const CONTENT_X = CARD_X + 40;
const CONTENT_W = CARD_W - 80;
const CONTENT_RIGHT = CONTENT_X + CONTENT_W;

const TYPE_COLORS = {
  'ОРУЖИЕ': '#c0392b',
  'КАСТОМИЗАЦИЯ': '#8e44ad',
  'ЗАЩИТА ПЕРСОНАЖА': '#2980b9',
  'ЭКИПИРОВКА': '#2980b9',
  'ТЕХНИКА': '#16a085',
  'ОСТАЛЬНОЕ': '#7f8c8d',
  'Без типа': '#555b66',
};

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 45%)`;
}
const typeColor = (type) => TYPE_COLORS[type] || hashColor(type || '?');

/* ---------- низкоуровневые помощники рисования ---------- */

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function panel(ctx, x, y, w, h, r, fill = PANEL2, stroke = LINE) {
  roundRect(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

function setFont(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

function text(ctx, str, x, y, { size = 28, weight = 400, color = TEXT, align = 'left', baseline = 'alphabetic' } = {}) {
  setFont(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
}

function truncate(ctx, str, maxWidth, size, weight = 400) {
  setFont(ctx, size, weight);
  if (ctx.measureText(str).width <= maxWidth) return str;
  let s = str;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

function measure(ctx, str, size, weight = 400) {
  setFont(ctx, size, weight);
  return ctx.measureText(str).width;
}

/** Плашка-бейдж с текстом; возвращает занятую ширину/высоту. */
function badge(ctx, str, x, y, { color = TEXT, bg = PANEL2, border = LINE, size = 22, weight = 600, padX = 16 } = {}) {
  setFont(ctx, size, weight);
  const h = size + 20;
  const w = ctx.measureText(str).width + padX * 2;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x + padX, y + h / 2 + 1);
  return { width: w, height: h };
}

/** Ряд бейджей с переносом на новую строку при нехватке ширины. Возвращает y после ряда. */
function badgeRow(ctx, items, x0, y0, maxWidth, gap = 12, lineGap = 14) {
  let x = x0;
  let y = y0;
  let rowH = 0;
  for (const it of items) {
    if (!it.text) continue;
    setFont(ctx, it.size || 22, 600);
    const w = ctx.measureText(it.text).width + 32;
    if (x !== x0 && x + w > x0 + maxWidth) {
      x = x0;
      y += rowH + lineGap;
    }
    const size = badge(ctx, it.text, x, y, it);
    x += size.width + gap;
    rowH = size.height;
  }
  return y + rowH;
}

function divider(ctx, y) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CONTENT_X, y);
  ctx.lineTo(CONTENT_RIGHT, y);
  ctx.stroke();
}

/* ---------- каркас карточки ---------- */

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  return { c, ctx };
}

function drawFrame(ctx, accent = GOLD) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 28);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 28);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(CARD_X, CARD_Y, 10, CARD_H);
  ctx.restore();
}

function drawFooter(ctx, left, right) {
  const y = CARD_Y + CARD_H - 56;
  divider(ctx, y);
  text(ctx, left, CONTENT_X, y + 36, { size: 21, color: MUTED });
  text(ctx, right, CONTENT_RIGHT, y + 36, { size: 21, color: MUTED, align: 'right' });
}

function footerMeta(meta = {}) {
  const date = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return { left: meta.left || 'Каталог предметов', right: meta.right || date };
}

/* ---------- заголовок предмета (переиспользуется в обычной карточке и в added/removed) ---------- */

function initialOf(item) {
  const s = (item.nameEn || item.nameRu || '?').trim();
  return s.charAt(0).toUpperCase() || '?';
}

function drawItemHeader(ctx, item, y0) {
  const badgeSize = 124;
  const color = typeColor(item.type);
  roundRect(ctx, CONTENT_X, y0, badgeSize, badgeSize, 22);
  ctx.fillStyle = color;
  ctx.fill();
  text(ctx, initialOf(item), CONTENT_X + badgeSize / 2, y0 + badgeSize / 2, {
    size: 62,
    weight: 700,
    color: '#ffffff',
    align: 'center',
    baseline: 'middle',
  });

  const nx = CONTENT_X + badgeSize + 32;
  const nameMaxW = CONTENT_RIGHT - nx - 160;
  text(ctx, truncate(ctx, item.nameRu, nameMaxW, 46, 700), nx, y0 + 50, { size: 46, weight: 700 });
  if (item.nameEn) {
    text(ctx, truncate(ctx, item.nameEn, nameMaxW, 24, 400), nx, y0 + 84, { size: 24, color: MUTED });
  }
  text(ctx, `ID ${item.id}`, CONTENT_RIGHT, y0 + 28, { size: 21, color: MUTED, align: 'right' });

  const rowY = y0 + badgeSize + 22;
  const bottom = badgeRow(
    ctx,
    [
      { text: item.type, color: color, border: color, bg: PANEL2 },
      { text: item.category },
      { text: item.theme },
      { text: item.visible },
    ],
    CONTENT_X,
    rowY,
    CONTENT_W
  );
  return bottom + 20;
}

function drawKpis(ctx, kpis, y, height = 130) {
  const gap = 20;
  const n = kpis.length;
  const boxW = (CONTENT_W - gap * (n - 1)) / n;
  kpis.forEach((k, i) => {
    const x = CONTENT_X + i * (boxW + gap);
    panel(ctx, x, y, boxW, height, 16, PANEL2, LINE);
    text(ctx, String(k.value), x + boxW / 2, y + height * 0.5, {
      size: 42,
      weight: 700,
      color: k.color || TEXT,
      align: 'center',
      baseline: 'middle',
    });
    text(ctx, k.label, x + boxW / 2, y + height - 16, { size: 20, color: MUTED, align: 'center' });
  });
  return y + height;
}

function drawUpgradesSection(ctx, upgrades, y, bottomLimit) {
  text(ctx, 'Улучшения', CONTENT_X, y + 30, { size: 30, weight: 700 });
  const areaY = y + 56;
  const areaH = bottomLimit - areaY;
  if (!upgrades.length) {
    text(ctx, 'У этого предмета нет улучшений', CONTENT_X + CONTENT_W / 2, areaY + areaH / 2, {
      size: 24,
      color: MUTED,
      align: 'center',
      baseline: 'middle',
    });
    return;
  }
  const n = upgrades.length;
  const cols = n <= 2 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = 20;
  const cw = (CONTENT_W - gap * (cols - 1)) / cols;
  const ch = Math.min((areaH - gap * (rows - 1)) / rows, 190);
  const maxTotal = Math.max(1, ...upgrades.map((u) => u.levels.reduce((s, l) => s + (l.gold || 0), 0)));

  upgrades.forEach((u, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = CONTENT_X + col * (cw + gap);
    const by = areaY + row * (ch + gap);
    panel(ctx, bx, by, cw, ch, 14, PANEL2, LINE);
    text(ctx, truncate(ctx, u.name, cw - 32, 24, 700), bx + 18, by + 36, { size: 24, weight: 700 });

    const first = u.levels[0];
    const last = u.levels[u.levels.length - 1];
    const total = u.levels.reduce((s, l) => s + (l.gold || 0), 0);
    const rangeStr = first && last ? `${fmt(first.value)} → ${fmt(last.value)}` : '—';
    text(ctx, rangeStr, bx + 18, by + 72, { size: 27, weight: 600, color: GOLD });
    text(ctx, `${fmt(total)} зол. · ${u.levels.length} ур.`, bx + 18, by + 102, { size: 19, color: MUTED });

    const barY = by + ch - 26;
    const barW = cw - 36;
    roundRect(ctx, bx + 18, barY, barW, 8, 4);
    ctx.fillStyle = LINE;
    ctx.fill();
    const fillW = Math.max(6, barW * (total / maxTotal));
    roundRect(ctx, bx + 18, barY, fillW, 8, 4);
    ctx.fillStyle = GOLD;
    ctx.fill();
  });
}

/* ---------- 1) карточка характеристик предмета ---------- */

export function renderItemCard(item, meta = {}) {
  const { c, ctx } = makeCanvas();
  drawFrame(ctx, typeColor(item.type));
  const afterHeader = drawItemHeader(ctx, item, CARD_Y + 40);
  const afterKpis = drawKpis(
    ctx,
    [
      { label: 'Мин. уровень', value: item.minLvl ?? '—' },
      { label: 'Цена, золото', value: fmt(item.cost), color: GOLD },
      { label: 'За покупку', value: item.buyAmount },
      { label: 'Улучшений', value: item.upgradeCount },
    ],
    afterHeader + 10
  );
  drawUpgradesSection(ctx, item.upgrades, afterKpis + 28, CARD_Y + CARD_H - 72);
  const fm = footerMeta({ left: `Источник: MeowTech Blockade` });
  drawFooter(ctx, fm.left, fm.right);
  return c;
}

/* ---------- 2) карточка сравнения одного предмета ---------- */

function statusRibbon(ctx, statusKey) {
  const color = STATUS_COLOR[statusKey];
  badge(ctx, STATUS_LABEL[statusKey], CONTENT_X, CARD_Y + 36, {
    size: 26,
    weight: 700,
    color: '#111',
    bg: color,
    border: color,
    padX: 22,
  });
}

function fieldChip(f) {
  const color = f.kind === 'number' ? (f.dir === 'up' ? GREEN : f.dir === 'down' ? RED : TEXT) : BLUE;
  return { label: f.label, value: fieldValueText(f), color };
}

function upgradeChip(u) {
  if (u.status === 'added') return { label: `Улучшение «${u.name}»`, value: 'добавлено целиком', color: GREEN };
  if (u.status === 'removed') return { label: `Улучшение «${u.name}»`, value: 'удалено целиком', color: RED };
  let ups = 0;
  let downs = 0;
  const parts = u.levelChanges.slice(0, 2).map((lc) => {
    if (lc.status === 'added') return `+ур.${lc.id}`;
    if (lc.status === 'removed') return `−ур.${lc.id}`;
    const bits = [];
    if (lc.value) {
      bits.push(`ур.${lc.id} ${fmt(lc.value.old)}→${fmt(lc.value.next)}`);
      lc.value.dir === 'up' ? ups++ : lc.value.dir === 'down' ? downs++ : null;
    }
    if (lc.gold) {
      bits.push(`цена ${fmt(lc.gold.old)}→${fmt(lc.gold.next)}`);
      lc.gold.dir === 'up' ? ups++ : lc.gold.dir === 'down' ? downs++ : null;
    }
    return bits.join(', ');
  });
  const extra = u.levelChanges.length > 2 ? ` +${u.levelChanges.length - 2} ещё` : '';
  const color = ups === downs ? BLUE : ups > downs ? GREEN : RED;
  return { label: `Улучшение «${u.name}»`, value: parts.join('; ') + extra, color };
}

function drawChips(ctx, chips, y, bottomLimit) {
  if (!chips.length) {
    text(ctx, 'Основные характеристики не изменились', CONTENT_X, y + 30, { size: 24, color: MUTED });
    return;
  }
  const gap = 18;
  const cols = 2;
  const cw = (CONTENT_W - gap) / cols;
  const rowH = 104;
  const maxRows = Math.max(1, Math.floor((bottomLimit - y) / (rowH + gap)));
  const visible = chips.slice(0, maxRows * cols - (chips.length > maxRows * cols ? 1 : 0));
  visible.forEach((chip, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = CONTENT_X + col * (cw + gap);
    const by = y + row * (rowH + gap);
    panel(ctx, bx, by, cw, rowH, 14, PANEL2, LINE);
    text(ctx, truncate(ctx, chip.label, cw - 36, 19, 600), bx + 18, by + 32, { size: 19, weight: 600, color: MUTED });
    text(ctx, truncate(ctx, chip.value, cw - 36, 26, 700), bx + 18, by + 70, { size: 26, weight: 700, color: chip.color });
  });
  if (chips.length > visible.length) {
    const left = chips.length - visible.length;
    const row = Math.floor(visible.length / cols);
    const by = y + row * (rowH + gap);
    text(ctx, `и ещё ${left} изменени${left === 1 ? 'е' : left < 5 ? 'я' : 'й'}…`, CONTENT_X, by + rowH / 2, {
      size: 22,
      color: GOLD,
      baseline: 'middle',
    });
  }
}

export function renderDiffCard(entry, meta = {}) {
  const { c, ctx } = makeCanvas();
  const color = STATUS_COLOR[entry.status];
  drawFrame(ctx, color);
  statusRibbon(ctx, entry.status);

  const item = entry.next || entry.old;
  const titleY = CARD_Y + 130;

  if (entry.status === 'changed' && entry.fields.some((f) => f.key === 'nameRu')) {
    const nf = entry.fields.find((f) => f.key === 'nameRu');
    text(ctx, truncate(ctx, `${nf.old} → ${nf.next}`, CONTENT_W - 160, 40, 700), CONTENT_X, titleY, { size: 40, weight: 700 });
  } else {
    text(ctx, truncate(ctx, item.nameRu, CONTENT_W - 160, 44, 700), CONTENT_X, titleY, { size: 44, weight: 700 });
  }
  text(ctx, `ID ${entry.id}`, CONTENT_RIGHT, CARD_Y + 44, { size: 21, color: MUTED, align: 'right' });
  text(ctx, `${item.type} · ${item.category}`, CONTENT_X, titleY + 34, { size: 24, color: MUTED });

  const bodyTop = titleY + 70;
  divider(ctx, bodyTop);

  if (entry.status === 'changed') {
    text(ctx, 'Что изменилось', CONTENT_X, bodyTop + 46, { size: 28, weight: 700, color: BLUE });
    const chips = [...entry.fields.map(fieldChip), ...entry.upgrades.map(upgradeChip)];
    drawChips(ctx, chips, bodyTop + 66, CARD_Y + CARD_H - 72);
  } else {
    const afterKpis = drawKpis(
      ctx,
      [
        { label: 'Мин. уровень', value: item.minLvl ?? '—' },
        { label: 'Цена, золото', value: fmt(item.cost), color: GOLD },
        { label: 'Доступность', value: item.visible },
        { label: 'Улучшений', value: item.upgradeCount },
      ],
      bodyTop + 24
    );
    drawUpgradesSection(ctx, item.upgrades, afterKpis + 24, CARD_Y + CARD_H - 72);
  }

  const fm = footerMeta({ left: meta.left });
  drawFooter(ctx, fm.left, fm.right);
  return c;
}

/* ---------- 3) итоговая карточка обновления ---------- */

function drawKpiGrid(ctx, metrics, y, cols, rowH, gap = 20) {
  const rows = Math.ceil(metrics.length / cols);
  const cw = (CONTENT_W - gap * (cols - 1)) / cols;
  metrics.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = CONTENT_X + col * (cw + gap);
    const by = y + row * (rowH + gap);
    panel(ctx, x, by, cw, rowH, 16, PANEL2, LINE);
    text(ctx, String(m.value), x + cw / 2, by + rowH * 0.46, { size: 40, weight: 700, color: m.color || TEXT, align: 'center', baseline: 'middle' });
    text(ctx, m.label, x + cw / 2, by + rowH - 16, { size: 19, color: MUTED, align: 'center' });
  });
  return y + rows * rowH + (rows - 1) * gap;
}

function drawBarList(ctx, data, x, y, w, color, maxBars = 6) {
  if (!data.length) {
    text(ctx, 'Нет данных', x, y + 26, { size: 20, color: MUTED });
    return;
  }
  const rows = data.slice(0, maxBars);
  const max = Math.max(...rows.map(([, v]) => v), 1);
  const rowH = 38;
  rows.forEach(([label, value], i) => {
    const ry = y + i * rowH;
    const labelW = w * 0.42;
    text(ctx, truncate(ctx, label, labelW - 10, 18, 500), x, ry + 16, { size: 18, color: TEXT });
    const barX = x + labelW;
    const barW = w - labelW - 54;
    roundRect(ctx, barX, ry + 4, barW, 12, 6);
    ctx.fillStyle = LINE;
    ctx.fill();
    roundRect(ctx, barX, ry + 4, Math.max(6, barW * (value / max)), 12, 6);
    ctx.fillStyle = color;
    ctx.fill();
    text(ctx, fmt(value), x + w, ry + 16, { size: 18, weight: 700, color, align: 'right' });
  });
}

export function renderSummaryCard(diff, summary, meta = {}) {
  const { c, ctx } = makeCanvas();
  drawFrame(ctx, GOLD);

  text(ctx, meta.title || 'Сводка обновления предметов', CONTENT_X, CARD_Y + 66, { size: 42, weight: 700 });
  text(
    ctx,
    `${meta.baseSource || 'старая версия'}  →  ${meta.newSource || 'новая версия'}`,
    CONTENT_X,
    CARD_Y + 102,
    { size: 22, color: MUTED }
  );
  const topDivY = CARD_Y + 128;
  divider(ctx, topDivY);

  const kpiBottom = drawKpiGrid(
    ctx,
    [
      { label: 'Было предметов', value: fmt(diff.baseCount) },
      { label: 'Стало предметов', value: fmt(diff.newCount) },
      { label: 'Новых', value: `+${fmt(diff.added.length)}`, color: YELLOW },
      { label: 'Удалено', value: `−${fmt(diff.removed.length)}`, color: RED },
      { label: 'Изменено', value: fmt(diff.changed.length), color: BLUE },
      { label: 'Без изменений', value: fmt(diff.unchanged.length), color: MUTED },
    ],
    topDivY + 26,
    3,
    108
  );

  const barsY = kpiBottom + 40;
  const halfW = (CONTENT_W - 40) / 2;
  text(ctx, 'НОВЫЕ ПО ТИПАМ', CONTENT_X, barsY, { size: 20, weight: 700, color: YELLOW });
  text(ctx, 'ИЗМЕНЁННЫЕ ПО ТИПАМ', CONTENT_X + halfW + 40, barsY, { size: 20, weight: 700, color: BLUE });
  drawBarList(ctx, summary.addedByType, CONTENT_X, barsY + 26, halfW, YELLOW, 6);
  drawBarList(ctx, summary.changedByType, CONTENT_X + halfW + 40, barsY + 26, halfW, BLUE, 6);

  const listY = barsY + 26 + 6 * 38 + 36;
  text(ctx, 'КРУПНЕЙШИЕ ИЗМЕНЕНИЯ ЦЕНЫ', CONTENT_X, listY, { size: 20, weight: 700, color: GOLD });
  if (!summary.costDeltas.length) {
    text(ctx, 'Изменений цены нет', CONTENT_X, listY + 36, { size: 22, color: MUTED });
  } else {
    summary.costDeltas.forEach((d, i) => {
      const ry = listY + 34 + i * 44;
      const color = d.delta > 0 ? GREEN : RED;
      text(ctx, truncate(ctx, d.name, CONTENT_W * 0.5, 23, 500), CONTENT_X, ry, { size: 23, color: TEXT });
      text(
        ctx,
        `${fmt(d.old)} → ${fmt(d.next)}  (${d.delta > 0 ? '+' : ''}${fmt(d.delta)})`,
        CONTENT_RIGHT,
        ry,
        { size: 23, weight: 700, color, align: 'right' }
      );
    });
  }

  const fm = footerMeta({ left: 'Сгенерировано каталогом предметов' });
  drawFooter(ctx, fm.left, fm.right);
  return c;
}

/* ---------- экспорт / предпросмотр ---------- */

let lastUrl = null;

export function exportCanvas(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('не удалось создать изображение (toBlob вернул пусто)'));
      resolve(blob);
    }, 'image/png');
  });
}

/** Показывает сгенерированный канвас в модальном окне предпросмотра со ссылкой на скачивание. */
export async function showPhotoPreview(canvas, filename) {
  try {
    const blob = await exportCanvas(canvas);
    const url = URL.createObjectURL(blob);
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = url;

    const dialog = document.getElementById('photoModal');
    const img = document.getElementById('photoImg');
    const link = document.getElementById('photoDownload');
    if (!dialog || !img || !link) throw new Error('не найдены элементы окна предпросмотра');

    img.src = url;
    link.href = url;
    link.setAttribute('download', filename);
    if (!dialog.open) dialog.showModal();
  } catch (err) {
    console.error(err);
    notify(`Не удалось подготовить изображение: ${err.message}`, 'error');
  }
}

export function itemFilename(item, prefix = 'item') {
  return `${prefix}_${slug(item.nameEn || item.nameRu)}_${item.id}.png`;
}
