/* Фоторежим: рисуем карточки на <canvas> и отдаём готовый PNG 1720×1280.
 * Иконки предметов намеренно не используются (они с внешнего домена и может
 * не быть CORS — это испортило бы экспорт), вместо них — цветная буква-плашка
 * по типу предмета. Все размеры даны в CSS-пикселях самого канваса.
 *
 * Оформление — в стиле MeowTech: тёмный «void»-фон, огненные акценты (pink/сакура/
 * фиолетовый), неоновые градиенты, сканлайны, HUD-уголки и еле заметный
 * диагональный водяной знак MeowTech_BSP. Логика карточек при этом не меняется. */
import { fmt, esc, slug, notify } from './core.js';
import { fieldValueText } from './diff.js';

export const W = 1720;
export const H = 1280;

const BG = '#07060d';
const PANEL2 = '#13101f';
const LINE = '#2a2340';
const TEXT = '#f5f1ff';
const MUTED = '#a49cc0';
const BRAND = '#ff2e63';
const SAKURA = '#ff8fab';
const VIOLET = '#8a6df0';
const GOLD = '#ffc24b';
const GREEN = '#3ecf8e';
const RED = '#ef5350';
const BLUE = '#4fa3ff';
const YELLOW = '#ffd400';

const WATERMARK = 'MeowTech_BSP';

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
  'ОРУЖИЕ': '#e8455e',
  'КАСТОМИЗАЦИЯ': '#9b59f6',
  'ЗАЩИТА ПЕРСОНАЖА': '#3d8bfd',
  'ЭКИПИРОВКА': '#3d8bfd',
  'ТЕХНИКА': '#12b8a6',
  'ОСТАЛЬНОЕ': '#7a7f96',
  'Без типа': '#5a5f70',
};

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 58%)`;
}
const typeColor = (type) => TYPE_COLORS[type] || hashColor(type || '?');

/* ---------- цветовые помощники ---------- */

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/** hex + прозрачность → rgba(). */
function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Любой CSS-цвет (hex/hsl/rgb) → тот же цвет с прозрачностью. */
function withAlpha(color, alpha) {
  if (color.startsWith('#')) return rgba(color, alpha);
  if (color.startsWith('hsl(')) return color.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  return color;
}

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
const MONO = '"JetBrains Mono", "Cascadia Mono", Consolas, "SF Mono", "DejaVu Sans Mono", monospace';

function setFont(ctx, size, weight = 400, font = FONT) {
  ctx.font = `${weight} ${size}px ${font}`;
}

function text(
  ctx,
  str,
  x,
  y,
  { size = 28, weight = 400, color = TEXT, align = 'left', baseline = 'alphabetic', font = FONT, spacing = 0 } = {}
) {
  setFont(ctx, size, weight, font);
  const tracked = spacing && 'letterSpacing' in ctx;
  if (tracked) ctx.letterSpacing = `${spacing}px`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
  if (tracked) ctx.letterSpacing = '0px';
}

/** Текст с горизонтальным градиентом (заголовки карточек). */
function gradientText(
  ctx,
  str,
  x,
  y,
  { size = 46, weight = 700, align = 'left', baseline = 'alphabetic', from = TEXT, to = SAKURA, font = FONT } = {}
) {
  setFont(ctx, size, weight, font);
  const w = ctx.measureText(str).width;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const g = ctx.createLinearGradient(x0, y - size, x0 + w, y + size * 0.25);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
}

function truncate(ctx, str, maxWidth, size, weight = 400, font = FONT) {
  setFont(ctx, size, weight, font);
  if (ctx.measureText(str).width <= maxWidth) return str;
  let s = str;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

function measure(ctx, str, size, weight = 400, font = FONT) {
  setFont(ctx, size, weight, font);
  return ctx.measureText(str).width;
}

/** Подбирает размер шрифта, чтобы строка влезла в maxWidth (не меньше min). */
function fitFontSize(ctx, str, maxWidth, start, min, weight = 700, font = MONO) {
  let size = start;
  setFont(ctx, size, weight, font);
  while (size > min && ctx.measureText(str).width > maxWidth) {
    size -= 2;
    setFont(ctx, size, weight, font);
  }
  return size;
}

/** Плашка-бейдж с текстом; возвращает занятую ширину/высоту. */
function badge(
  ctx,
  str,
  x,
  y,
  { color = MUTED, bg = 'rgba(255, 255, 255, 0.045)', border = 'rgba(255, 255, 255, 0.10)', size = 21, weight = 600, padX = 16, font = FONT, spacing = 0 } = {}
) {
  setFont(ctx, size, weight, font);
  const tracked = spacing && 'letterSpacing' in ctx;
  if (tracked) ctx.letterSpacing = `${spacing}px`;
  const h = size + 20;
  const w = ctx.measureText(str).width + padX * 2;
  if (tracked) ctx.letterSpacing = '0px';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }
  // лёгкий блик сверху — «стеклянный» вид
  const gloss = ctx.createLinearGradient(0, y, 0, y + h);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
  gloss.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gloss;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (tracked) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(str, x + padX, y + h / 2 + 1);
  if (tracked) ctx.letterSpacing = '0px';
  return { width: w, height: h };
}

/** Ряд бейджей с переносом на новую строку при нехватке ширины. Возвращает y после ряда. */
function badgeRow(ctx, items, x0, y0, maxWidth, gap = 12, lineGap = 14) {
  let x = x0;
  let y = y0;
  let rowH = 0;
  for (const it of items) {
    if (!it.text) continue;
    const size = it.size || 21;
    const padX = it.padX ?? 16;
    setFont(ctx, size, it.weight || 600, it.font || FONT);
    const tracked = it.spacing && 'letterSpacing' in ctx;
    if (tracked) ctx.letterSpacing = `${it.spacing}px`;
    const w = ctx.measureText(it.text).width + padX * 2;
    if (tracked) ctx.letterSpacing = '0px';
    if (x !== x0 && x + w > x0 + maxWidth) {
      x = x0;
      y += rowH + lineGap;
    }
    const box = badge(ctx, it.text, x, y, it);
    x += box.width + gap;
    rowH = box.height;
  }
  return y + rowH;
}

function divider(ctx, y) {
  const g = ctx.createLinearGradient(CONTENT_X, y, CONTENT_RIGHT, y);
  g.addColorStop(0, rgba(BRAND, 0.55));
  g.addColorStop(0.28, rgba(VIOLET, 0.28));
  g.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  ctx.strokeStyle = g;
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

function drawFrame(ctx, accent = BRAND) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // мягкие цветные свечения фона — «void» с огненными акцентами
  const glows = [
    { x: W * 0.16, y: -H * 0.1, r: H * 0.95, c: accent, a: 0.2 },
    { x: W * 0.94, y: H * 0.08, r: H * 0.78, c: BRAND, a: 0.12 },
    { x: W * 0.5, y: H * 1.1, r: H * 0.85, c: VIOLET, a: 0.14 },
  ];
  for (const g of glows) {
    const grd = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
    grd.addColorStop(0, withAlpha(g.c, g.a));
    grd.addColorStop(0.55, withAlpha(g.c, g.a * 0.26));
    grd.addColorStop(1, withAlpha(g.c, 0));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  }

  // сканлайны, как на старых CRT-мониторах
  ctx.fillStyle = 'rgba(255, 255, 255, 0.016)';
  for (let sy = 0; sy < H; sy += 3) ctx.fillRect(0, sy, W, 1);

  // виньетка по краям
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.98);
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(1, 'rgba(0, 0, 0, 0.58)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // сама карточка — тёмный градиент вместо плоской заливки
  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 28);
  const panelGrad = ctx.createLinearGradient(CARD_X, CARD_Y, CARD_X + CARD_W * 0.45, CARD_Y + CARD_H);
  panelGrad.addColorStop(0, '#110d1e');
  panelGrad.addColorStop(0.58, '#0b0915');
  panelGrad.addColorStop(1, '#08060f');
  ctx.fillStyle = panelGrad;
  ctx.fill();

  ctx.save();
  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 28);
  ctx.clip();

  // еле заметная сетка-подложка
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.018)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = CARD_X + 44; gx < CARD_X + CARD_W; gx += 44) {
    ctx.moveTo(gx, CARD_Y);
    ctx.lineTo(gx, CARD_Y + CARD_H);
  }
  for (let gy = CARD_Y + 44; gy < CARD_Y + CARD_H; gy += 44) {
    ctx.moveTo(CARD_X, gy);
    ctx.lineTo(CARD_X + CARD_W, gy);
  }
  ctx.stroke();

  // неоновая линия по верхней кромке
  const topLine = ctx.createLinearGradient(CARD_X, 0, CARD_X + CARD_W, 0);
  topLine.addColorStop(0, withAlpha(accent, 0));
  topLine.addColorStop(0.16, withAlpha(accent, 0.9));
  topLine.addColorStop(0.5, rgba(SAKURA, 0.85));
  topLine.addColorStop(0.84, withAlpha(VIOLET, 0.8));
  topLine.addColorStop(1, withAlpha(VIOLET, 0));
  ctx.fillStyle = topLine;
  ctx.fillRect(CARD_X, CARD_Y, CARD_W, 3);

  // градиентная полоса слева
  const leftBar = ctx.createLinearGradient(0, CARD_Y, 0, CARD_Y + CARD_H);
  leftBar.addColorStop(0, accent);
  leftBar.addColorStop(0.42, withAlpha(accent, 0.6));
  leftBar.addColorStop(1, withAlpha(VIOLET, 0.15));
  ctx.fillStyle = leftBar;
  ctx.fillRect(CARD_X, CARD_Y, 6, CARD_H);
  ctx.restore();

  // внешняя рамка с лёгким свечением
  ctx.save();
  ctx.shadowColor = withAlpha(accent, 0.28);
  ctx.shadowBlur = 26;
  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 28);
  ctx.strokeStyle = withAlpha(accent, 0.32);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  drawCorners(ctx, accent);
}

/** HUD-уголки по четырём углам карточки. */
function drawCorners(ctx, accent) {
  const len = 30;
  const o = 10;
  const x0 = CARD_X - o;
  const y0 = CARD_Y - o;
  const x1 = CARD_X + CARD_W + o;
  const y1 = CARD_Y + CARD_H + o;
  ctx.strokeStyle = withAlpha(accent, 0.55);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0 + len);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + len, y0);
  ctx.moveTo(x1 - len, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y0 + len);
  ctx.moveTo(x1, y1 - len);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - len, y1);
  ctx.moveTo(x0 + len, y1);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x0, y1 - len);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Плотная диагональная сетка «MeowTech_BSP» — как на старых фотостоках. */
function watermark(ctx) {
  const stepX = 420;
  const stepY = 178;
  const span = Math.hypot(W, H) + stepX * 2;
  const cols = Math.ceil(span / stepX);
  const rows = Math.ceil(span / stepY);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.font = `600 32px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';

  for (let r = -rows; r <= rows; r++) {
    const offset = r % 2 ? stepX / 2 : 0;
    ctx.fillStyle = rgba(r % 3 === 0 ? VIOLET : SAKURA, r % 3 === 0 ? 0.045 : 0.06);
    for (let c = -cols; c <= cols; c++) {
      ctx.fillText(WATERMARK, c * stepX + offset, r * stepY);
    }
  }

  ctx.restore();
}

function drawFooter(ctx, left, right) {
  const y = CARD_Y + CARD_H - 56;
  divider(ctx, y);

  // градиентный ромб-акцент перед подписью
  const cy = y + 30;
  ctx.save();
  ctx.translate(CONTENT_X + 6, cy);
  ctx.rotate(Math.PI / 4);
  const g = ctx.createLinearGradient(-6, -6, 6, 6);
  g.addColorStop(0, BRAND);
  g.addColorStop(1, SAKURA);
  ctx.fillStyle = g;
  ctx.fillRect(-5, -5, 10, 10);
  ctx.restore();

  text(ctx, left, CONTENT_X + 24, y + 36, { size: 17, color: MUTED, font: MONO, spacing: 0.8 });
  text(ctx, right, CONTENT_RIGHT, y + 36, { size: 17, color: MUTED, align: 'right', font: MONO, spacing: 0.8 });
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
  const radius = 24;

  // плашка с буквой: градиент + внутренний блик
  ctx.save();
  ctx.shadowColor = withAlpha(color, 0.35);
  ctx.shadowBlur = 30;
  roundRect(ctx, CONTENT_X, y0, badgeSize, badgeSize, radius);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  const shade = ctx.createLinearGradient(CONTENT_X, y0, CONTENT_X + badgeSize, y0 + badgeSize);
  shade.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  shade.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
  roundRect(ctx, CONTENT_X, y0, badgeSize, badgeSize, radius);
  ctx.fillStyle = shade;
  ctx.fill();

  roundRect(ctx, CONTENT_X, y0, badgeSize, badgeSize, radius);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1.25;
  ctx.stroke();

  text(ctx, initialOf(item), CONTENT_X + badgeSize / 2, y0 + badgeSize / 2 + 2, {
    size: 62,
    weight: 700,
    color: '#ffffff',
    align: 'center',
    baseline: 'middle',
  });

  const nx = CONTENT_X + badgeSize + 32;
  const nameMaxW = CONTENT_RIGHT - nx - 160;
  gradientText(ctx, truncate(ctx, item.nameRu, nameMaxW, 46, 700), nx, y0 + 50, {
    size: 46,
    weight: 700,
    from: TEXT,
    to: SAKURA,
  });
  if (item.nameEn) {
    text(ctx, truncate(ctx, item.nameEn, nameMaxW, 24, 400), nx, y0 + 84, { size: 24, color: MUTED, font: MONO, spacing: 0.3 });
  }

  // ID — моно-чип в правом верхнем углу
  const idText = `ID ${item.id}`;
  setFont(ctx, 17, 600, MONO);
  const idW = ctx.measureText(idText).width + 26;
  const idH = 30;
  roundRect(ctx, CONTENT_RIGHT - idW, y0 + 12, idW, idH, 8);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fill();
  ctx.strokeStyle = withAlpha(VIOLET, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();
  text(ctx, idText, CONTENT_RIGHT - idW / 2, y0 + 12 + idH / 2 + 1, {
    size: 17,
    weight: 600,
    color: MUTED,
    align: 'center',
    baseline: 'middle',
    font: MONO,
    spacing: 1.2,
  });

  const rowY = y0 + badgeSize + 22;
  const bottom = badgeRow(
    ctx,
    [
      { text: item.type, color: color, border: withAlpha(color, 0.5), bg: withAlpha(color, 0.14) },
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
    const accent = k.color || SAKURA;
    panel(ctx, x, y, boxW, height, 16, PANEL2, LINE);

    // акцентная мини-полоса сверху
    const bar = ctx.createLinearGradient(x, 0, x + 56, 0);
    bar.addColorStop(0, withAlpha(accent, 0.95));
    bar.addColorStop(1, withAlpha(accent, 0));
    roundRect(ctx, x + 18, y + 15, 56, 3, 1.5);
    ctx.fillStyle = bar;
    ctx.fill();

    const value = String(k.value);
    const numeric = /^[\d\s.,+\-−%]+$/.test(value);
    const size = fitFontSize(ctx, value, boxW - 28, numeric ? 42 : 30, 22, 700, MONO);
    text(ctx, value, x + boxW / 2, y + height * 0.52, {
      size,
      weight: 700,
      color: k.color || TEXT,
      align: 'center',
      baseline: 'middle',
      font: MONO,
    });
    text(ctx, String(k.label).toUpperCase(), x + boxW / 2, y + height - 16, {
      size: 16,
      color: MUTED,
      align: 'center',
      font: MONO,
      spacing: 1.4,
    });
  });
  return y + height;
}

function drawUpgradesSection(ctx, upgrades, y, bottomLimit) {
  text(ctx, '// УЛУЧШЕНИЯ', CONTENT_X, y + 30, { size: 20, weight: 700, color: BRAND, font: MONO, spacing: 2.4 });
  text(ctx, upgrades.length ? `ВСЕГО ${upgrades.length}` : 'НЕТ', CONTENT_RIGHT, y + 30, {
    size: 16,
    weight: 600,
    color: MUTED,
    align: 'right',
    font: MONO,
    spacing: 1.6,
  });
  const areaY = y + 56;
  const areaH = bottomLimit - areaY;
  if (!upgrades.length) {
    const pw = Math.min(CONTENT_W - 160, 840);
    const ph = 236;
    const px = CONTENT_X + (CONTENT_W - pw) / 2;
    const py = areaY + Math.max(0, (areaH - ph) / 2);

    roundRect(ctx, px, py, pw, ph, 22);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.016)';
    ctx.fill();
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = withAlpha(VIOLET, 0.35);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const cx = px + pw / 2;
    const cy = py + ph / 2;
    text(ctx, 'Ø', cx, cy - 44, {
      size: 62,
      weight: 700,
      color: withAlpha(SAKURA, 0.6),
      align: 'center',
      baseline: 'middle',
      font: MONO,
    });
    text(ctx, 'ПРОКАЧКА НЕ ПРЕДУСМОТРЕНА', cx, cy + 16, {
      size: 20,
      weight: 700,
      color: MUTED,
      align: 'center',
      baseline: 'middle',
      font: MONO,
      spacing: 2.6,
    });
    text(ctx, '// у этого предмета нет улучшений', cx, cy + 48, {
      size: 16,
      color: withAlpha(SAKURA, 0.55),
      align: 'center',
      baseline: 'middle',
      font: MONO,
      spacing: 0.8,
    });
    return;
  }
  const n = upgrades.length;
  const cols = n <= 2 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = 20;
  const cw = (CONTENT_W - gap * (cols - 1)) / cols;
  // карточки тянутся на всю доступную высоту (но не выше 340), чтобы не оставлять пустоту
  const ch = Math.min((areaH - gap * (rows - 1)) / rows, 340);
  const maxTotal = Math.max(1, ...upgrades.map((u) => u.levels.reduce((s, l) => s + (l.gold || 0), 0)));

  upgrades.forEach((u, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = CONTENT_X + col * (cw + gap);
    const by = areaY + row * (ch + gap);
    panel(ctx, bx, by, cw, ch, 14, PANEL2, LINE);

    // акцентная полоска слева
    const stripe = ctx.createLinearGradient(0, by + 16, 0, by + ch - 16);
    stripe.addColorStop(0, GOLD);
    stripe.addColorStop(1, withAlpha(SAKURA, 0.2));
    roundRect(ctx, bx + 14, by + 16, 3, ch - 32, 1.5);
    ctx.fillStyle = stripe;
    ctx.fill();

    const first = u.levels[0];
    const last = u.levels[u.levels.length - 1];
    const total = u.levels.reduce((s, l) => s + (l.gold || 0), 0);
    const rangeStr = first && last ? `${fmt(first.value)} → ${fmt(last.value)}` : '—';
    const rangeSize = ch >= 190 ? 42 : 26;
    const nameY = by + (ch >= 190 ? 34 : 36);
    const rangeY = ch >= 190 ? by + Math.round(ch * 0.5) : by + 72;
    const metaY = ch >= 190 ? rangeY + 34 : by + 102;

    text(ctx, truncate(ctx, u.name, cw - 52, 24, 700), bx + 28, nameY, { size: 24, weight: 700 });
    text(ctx, rangeStr, bx + 28, rangeY, { size: rangeSize, weight: 700, color: GOLD, font: MONO, spacing: 0.4 });
    text(ctx, `${fmt(total)} зол. · ${u.levels.length} ур.`, bx + 28, metaY, { size: 18, color: MUTED, font: MONO, spacing: 0.4 });

    const barY = by + ch - 28;
    const barW = cw - 56;
    roundRect(ctx, bx + 28, barY, barW, 8, 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.fill();
    const fillW = Math.max(6, barW * (total / maxTotal));
    const fill = ctx.createLinearGradient(bx + 28, 0, bx + 28 + fillW, 0);
    fill.addColorStop(0, GOLD);
    fill.addColorStop(1, SAKURA);
    ctx.save();
    ctx.shadowColor = withAlpha(GOLD, 0.45);
    ctx.shadowBlur = 12;
    roundRect(ctx, bx + 28, barY, fillW, 8, 4);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
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
  watermark(ctx);
  return c;
}

/* ---------- 2) карточка сравнения одного предмета ---------- */

function statusRibbon(ctx, statusKey) {
  const color = STATUS_COLOR[statusKey];
  ctx.save();
  ctx.shadowColor = withAlpha(color, 0.6);
  ctx.shadowBlur = 24;
  badge(ctx, STATUS_LABEL[statusKey], CONTENT_X, CARD_Y + 36, {
    size: 20,
    weight: 700,
    color,
    bg: withAlpha(color, 0.13),
    border: withAlpha(color, 0.6),
    padX: 22,
    font: MONO,
    spacing: 2.2,
  });
  ctx.restore();
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
    text(ctx, '— основные характеристики не изменились —', CONTENT_X, y + 30, {
      size: 20,
      color: MUTED,
      font: MONO,
      spacing: 0.6,
    });
    return;
  }
  const gap = 18;
  const cols = 2;
  const cw = (CONTENT_W - gap) / cols;
  const minRowH = 104;
  const maxRows = Math.max(1, Math.floor((bottomLimit - y) / (minRowH + gap)));
  const visible = chips.slice(0, maxRows * cols - (chips.length > maxRows * cols ? 1 : 0));
  const usedRows = Math.max(1, Math.ceil(visible.length / cols));
  // растягиваем карточки по высоте, чтобы не оставлять пустоту внизу
  const rowH = Math.max(
    minRowH,
    Math.min(190, Math.floor((bottomLimit - y - gap * (usedRows - 1)) / usedRows))
  );

  visible.forEach((chip, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = CONTENT_X + col * (cw + gap);
    const by = y + row * (rowH + gap);
    panel(ctx, bx, by, cw, rowH, 14, PANEL2, LINE);

    // цветная полоска-индикатор изменения
    roundRect(ctx, bx + 14, by + 18, 3, rowH - 36, 1.5);
    ctx.fillStyle = withAlpha(chip.color, 0.9);
    ctx.fill();

    text(ctx, truncate(ctx, chip.label.toUpperCase(), cw - 66, 16, 600, MONO), bx + 28, by + Math.round(rowH * 0.34), {
      size: 16,
      weight: 600,
      color: MUTED,
      font: MONO,
      spacing: 1.2,
    });
    const vSize = fitFontSize(ctx, chip.value, cw - 66, 28, 18, 700, MONO);
    const value = truncate(ctx, chip.value, cw - 66, vSize, 700, MONO);
    text(ctx, value, bx + 28, by + Math.round(rowH * 0.68), { size: vSize, weight: 700, color: chip.color, font: MONO });
  });
  if (chips.length > visible.length) {
    const left = chips.length - visible.length;
    const row = Math.floor(visible.length / cols);
    const by = y + row * (rowH + gap);
    text(ctx, `// и ещё ${left} изменени${left === 1 ? 'е' : left < 5 ? 'я' : 'й'}…`, CONTENT_X, by + rowH / 2, {
      size: 20,
      color: GOLD,
      baseline: 'middle',
      font: MONO,
      spacing: 0.8,
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
    gradientText(ctx, truncate(ctx, `${nf.old} → ${nf.next}`, CONTENT_W - 160, 40, 700), CONTENT_X, titleY, {
      size: 40,
      weight: 700,
      from: TEXT,
      to: SAKURA,
    });
  } else {
    gradientText(ctx, truncate(ctx, item.nameRu, CONTENT_W - 160, 44, 700), CONTENT_X, titleY, {
      size: 44,
      weight: 700,
      from: TEXT,
      to: SAKURA,
    });
  }

  // ID — моно-чип в правом верхнем углу
  const idText = `ID ${entry.id}`;
  setFont(ctx, 17, 600, MONO);
  const idW = ctx.measureText(idText).width + 26;
  const idH = 30;
  roundRect(ctx, CONTENT_RIGHT - idW, CARD_Y + 40, idW, idH, 8);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fill();
  ctx.strokeStyle = withAlpha(VIOLET, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();
  text(ctx, idText, CONTENT_RIGHT - idW / 2, CARD_Y + 40 + idH / 2 + 1, {
    size: 17,
    weight: 600,
    color: MUTED,
    align: 'center',
    baseline: 'middle',
    font: MONO,
    spacing: 1.2,
  });

  text(ctx, `${item.type} · ${item.category}`, CONTENT_X, titleY + 34, { size: 19, color: MUTED, font: MONO, spacing: 0.8 });

  const bodyTop = titleY + 70;
  divider(ctx, bodyTop);

  if (entry.status === 'changed') {
    text(ctx, '// ЧТО ИЗМЕНИЛОСЬ', CONTENT_X, bodyTop + 46, {
      size: 20,
      weight: 700,
      color: BLUE,
      font: MONO,
      spacing: 2.4,
    });
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
  watermark(ctx);
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
    const accent = m.color || SAKURA;
    panel(ctx, x, by, cw, rowH, 16, PANEL2, LINE);

    const bar = ctx.createLinearGradient(x, 0, x + 50, 0);
    bar.addColorStop(0, withAlpha(accent, 0.95));
    bar.addColorStop(1, withAlpha(accent, 0));
    roundRect(ctx, x + 18, by + 14, 50, 3, 1.5);
    ctx.fillStyle = bar;
    ctx.fill();

    const value = String(m.value);
    const size = fitFontSize(ctx, value, cw - 28, 40, 20, 700, MONO);
    text(ctx, value, x + cw / 2, by + rowH * 0.5, {
      size,
      weight: 700,
      color: m.color || TEXT,
      align: 'center',
      baseline: 'middle',
      font: MONO,
    });
    text(ctx, String(m.label).toUpperCase(), x + cw / 2, by + rowH - 15, {
      size: 15,
      color: MUTED,
      align: 'center',
      font: MONO,
      spacing: 1.3,
    });
  });
  return y + rows * rowH + (rows - 1) * gap;
}

function drawBarList(ctx, data, x, y, w, color, maxBars = 6) {
  if (!data.length) {
    text(ctx, '// нет данных', x, y + 24, { size: 18, color: MUTED, font: MONO, spacing: 0.6 });
    return;
  }
  const rows = data.slice(0, maxBars);
  const max = Math.max(...rows.map(([, v]) => v), 1);
  const rowH = 38;
  rows.forEach(([label, value], i) => {
    const ry = y + i * rowH;
    const labelW = w * 0.42;
    text(ctx, truncate(ctx, label, labelW - 10, 17, 500, MONO), x, ry + 16, { size: 17, color: TEXT, font: MONO, spacing: 0.4 });
    const barX = x + labelW;
    const barW = w - labelW - 58;
    roundRect(ctx, barX, ry + 4, barW, 12, 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.fill();
    const fillW = Math.max(6, barW * (value / max));
    const fill = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    fill.addColorStop(0, withAlpha(color, 0.55));
    fill.addColorStop(1, color);
    roundRect(ctx, barX, ry + 4, fillW, 12, 6);
    ctx.fillStyle = fill;
    ctx.fill();
    text(ctx, fmt(value), x + w, ry + 16, { size: 17, weight: 700, color, align: 'right', font: MONO, spacing: 0.4 });
  });
}

export function renderSummaryCard(diff, summary, meta = {}) {
  const { c, ctx } = makeCanvas();
  drawFrame(ctx, GOLD);

  gradientText(ctx, meta.title || 'Сводка обновления предметов', CONTENT_X, CARD_Y + 66, {
    size: 42,
    weight: 700,
    from: TEXT,
    to: SAKURA,
  });
  text(
    ctx,
    `${meta.baseSource || 'старая версия'}  →  ${meta.newSource || 'новая версия'}`,
    CONTENT_X,
    CARD_Y + 102,
    { size: 17, color: MUTED, font: MONO, spacing: 1 }
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
  text(ctx, '// НОВЫЕ ПО ТИПАМ', CONTENT_X, barsY, { size: 18, weight: 700, color: YELLOW, font: MONO, spacing: 2.2 });
  text(ctx, '// ИЗМЕНЁННЫЕ ПО ТИПАМ', CONTENT_X + halfW + 40, barsY, {
    size: 18,
    weight: 700,
    color: BLUE,
    font: MONO,
    spacing: 2.2,
  });
  drawBarList(ctx, summary.addedByType, CONTENT_X, barsY + 26, halfW, YELLOW, 6);
  drawBarList(ctx, summary.changedByType, CONTENT_X + halfW + 40, barsY + 26, halfW, BLUE, 6);

  const barRows = Math.min(6, Math.max(summary.addedByType.length, summary.changedByType.length, 1));
  const listY = barsY + 26 + barRows * 38 + 36;
  text(ctx, '// КРУПНЕЙШИЕ ИЗМЕНЕНИЯ ЦЕНЫ', CONTENT_X, listY, { size: 18, weight: 700, color: GOLD, font: MONO, spacing: 2.2 });
  if (!summary.costDeltas.length) {
    text(ctx, '— изменений цены нет —', CONTENT_X, listY + 36, { size: 20, color: MUTED, font: MONO, spacing: 0.8 });
  } else {
    const listTop = listY + 28;
    const bottomLimit = CARD_Y + CARD_H - 72;
    const rows = summary.costDeltas.length;
    const rowH = Math.min(80, Math.max(44, (bottomLimit - listTop) / rows));
    summary.costDeltas.forEach((d, i) => {
      const ry = listTop + i * rowH + Math.min(30, rowH * 0.62);
      const color = d.delta > 0 ? GREEN : RED;
      text(ctx, truncate(ctx, d.name, CONTENT_W * 0.5, 22, 500, MONO), CONTENT_X, ry, { size: 22, color: TEXT, font: MONO });
      text(
        ctx,
        `${fmt(d.old)} → ${fmt(d.next)}  (${d.delta > 0 ? '+' : ''}${fmt(d.delta)})`,
        CONTENT_RIGHT,
        ry,
        { size: 22, weight: 700, color, align: 'right', font: MONO }
      );
      if (i < rows - 1 && rowH >= 52) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(CONTENT_X, listTop + (i + 1) * rowH - 8);
        ctx.lineTo(CONTENT_RIGHT, listTop + (i + 1) * rowH - 8);
        ctx.stroke();
      }
    });
  }

  const fm = footerMeta({ left: 'Сгенерировано каталогом предметов' });
  drawFooter(ctx, fm.left, fm.right);
  watermark(ctx);
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
