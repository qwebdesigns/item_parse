/* Сравнение двух версий каталога предметов: добавленные, удалённые, изменённые. */
import { fmt } from './core.js';

const SCALAR_FIELDS = [
  { key: 'nameRu', label: 'Название (RU)', kind: 'text' },
  { key: 'nameEn', label: 'Название (EN)', kind: 'text' },
  { key: 'type', label: 'Тип', kind: 'text' },
  { key: 'category', label: 'Категория', kind: 'text' },
  { key: 'visible', label: 'Доступность', kind: 'text' },
  { key: 'theme', label: 'Тема', kind: 'text' },
  { key: 'minLvl', label: 'Мин. уровень', kind: 'number' },
  { key: 'cost', label: 'Цена, золото', kind: 'number' },
  { key: 'buyAmount', label: 'Кол-во за покупку', kind: 'number' },
];

const dirOf = (oldV, newV) => (oldV == null || newV == null ? null : newV > oldV ? 'up' : newV < oldV ? 'down' : null);

/** Сравнивает простые поля двух предметов. Возвращает только то, что отличается. */
export function diffFields(a, b) {
  const out = [];
  for (const f of SCALAR_FIELDS) {
    const ov = a[f.key];
    const nv = b[f.key];
    const same = f.kind === 'number' ? (ov ?? null) === (nv ?? null) : (ov || '') === (nv || '');
    if (same) continue;
    out.push({
      key: f.key,
      label: f.label,
      kind: f.kind,
      old: ov,
      next: nv,
      dir: f.kind === 'number' ? dirOf(ov, nv) : null,
    });
  }
  return out;
}

/** Сравнивает списки улучшений по имени, а уровни внутри — по id уровня. */
export function diffUpgrades(oldUpg = [], newUpg = []) {
  const byName = (arr) => new Map(arr.map((u) => [u.name, u]));
  const om = byName(oldUpg);
  const nm = byName(newUpg);
  const names = new Set([...om.keys(), ...nm.keys()]);
  const out = [];

  for (const name of names) {
    const o = om.get(name);
    const n = nm.get(name);
    if (o && !n) {
      out.push({ name, status: 'removed', old: o });
      continue;
    }
    if (!o && n) {
      out.push({ name, status: 'added', next: n });
      continue;
    }
    const oLevels = new Map(o.levels.map((l) => [l.id, l]));
    const nLevels = new Map(n.levels.map((l) => [l.id, l]));
    const ids = [...new Set([...oLevels.keys(), ...nLevels.keys()])].sort((a, b) => Number(a) - Number(b));
    const levelChanges = [];
    for (const id of ids) {
      const ol = oLevels.get(id);
      const nl = nLevels.get(id);
      if (ol && !nl) {
        levelChanges.push({ id, status: 'removed', old: ol });
      } else if (!ol && nl) {
        levelChanges.push({ id, status: 'added', next: nl });
      } else if (ol.value !== nl.value || ol.gold !== nl.gold) {
        levelChanges.push({
          id,
          status: 'changed',
          value: ol.value !== nl.value ? { old: ol.value, next: nl.value, dir: dirOf(ol.value, nl.value) } : null,
          gold: ol.gold !== nl.gold ? { old: ol.gold, next: nl.gold, dir: dirOf(ol.gold, nl.gold) } : null,
        });
      }
    }
    if (levelChanges.length) out.push({ name, status: 'changed', levelChanges });
  }
  return out;
}

/** Основная функция сравнения: два массива нормализованных предметов (core.js normalizeItem). */
export function diffItems(baseItems, newItems) {
  const baseMap = new Map(baseItems.map((i) => [i.id, i]));
  const newMap = new Map(newItems.map((i) => [i.id, i]));
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const [id, item] of baseMap) {
    if (!newMap.has(id)) removed.push({ status: 'removed', id, old: item });
  }
  for (const [id, item] of newMap) {
    const old = baseMap.get(id);
    if (!old) {
      added.push({ status: 'added', id, next: item });
      continue;
    }
    const fields = diffFields(old, item);
    const upgrades = diffUpgrades(old.upgrades, item.upgrades);
    if (fields.length || upgrades.length) {
      const magnitude =
        fields.length + upgrades.reduce((s, u) => s + (u.levelChanges ? u.levelChanges.length : 1), 0);
      changed.push({ status: 'changed', id, old, next: item, fields, upgrades, magnitude });
    } else {
      unchanged.push({ status: 'unchanged', id, old, next: item });
    }
  }

  const byId = (a, b) => (Number(a.id) || 0) - (Number(b.id) || 0);
  added.sort(byId);
  removed.sort(byId);
  changed.sort(byId);

  return {
    added,
    removed,
    changed,
    unchanged,
    baseCount: baseItems.length,
    newCount: newItems.length,
  };
}

/** Сводная статистика для "итоговой фотографии" обновления. */
export function summarizeDiff(diff) {
  const byType = (list, pick) => {
    const m = new Map();
    for (const e of list) {
      const t = pick(e).type;
      m.set(t, (m.get(t) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const addedByType = byType(diff.added, (e) => e.next);
  const changedByType = byType(diff.changed, (e) => e.next);
  const removedByType = byType(diff.removed, (e) => e.old);

  const costDeltas = diff.changed
    .map((e) => {
      const f = e.fields.find((x) => x.key === 'cost');
      if (!f || f.old == null || f.next == null) return null;
      return { id: e.id, name: e.next.nameRu, old: f.old, next: f.next, delta: f.next - f.old };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

  return { addedByType, changedByType, removedByType, costDeltas };
}

/** Текстовое представление одного изменения поля, например "50 → 65 (+15)". */
export function fieldValueText(f) {
  if (f.kind === 'number') {
    const delta = f.old != null && f.next != null ? f.next - f.old : null;
    const deltaStr = delta ? ` (${delta > 0 ? '+' : ''}${fmt(delta)})` : '';
    return `${fmt(f.old)} → ${fmt(f.next)}${deltaStr}`;
  }
  return `${f.old || '—'} → ${f.next || '—'}`;
}

/** Плоский список строк для CSV/JSON-экспорта: одна строка на каждое отличие. */
export function buildDiffRows(entries) {
  const rows = [];
  for (const e of entries) {
    const item = e.next || e.old;
    if (e.status !== 'changed') {
      rows.push([e.id, e.status === 'added' ? 'новый' : 'удалён', item.nameRu, item.type, item.category, '—', '', '']);
      continue;
    }
    for (const f of e.fields) rows.push([e.id, 'изменён', item.nameRu, item.type, item.category, f.label, f.old ?? '', f.next ?? '']);
    for (const u of e.upgrades) {
      if (u.status === 'added') {
        rows.push([e.id, 'изменён', item.nameRu, item.type, item.category, `Улучшение «${u.name}» добавлено`, '', '']);
      } else if (u.status === 'removed') {
        rows.push([e.id, 'изменён', item.nameRu, item.type, item.category, `Улучшение «${u.name}» удалено`, '', '']);
      } else {
        for (const lc of u.levelChanges) {
          if (lc.status === 'added') rows.push([e.id, 'изменён', item.nameRu, item.type, item.category, `${u.name}: добавлен ур.${lc.id}`, '', lc.next?.value ?? '']);
          else if (lc.status === 'removed') rows.push([e.id, 'изменён', item.nameRu, item.type, item.category, `${u.name}: удалён ур.${lc.id}`, lc.old?.value ?? '', '']);
          else {
            if (lc.value) rows.push([e.id, 'изменён', item.nameRu, item.type, item.category, `${u.name} ур.${lc.id}: значение`, lc.value.old, lc.value.next]);
            if (lc.gold) rows.push([e.id, 'изменён', item.nameRu, item.type, item.category, `${u.name} ур.${lc.id}: цена`, lc.gold.old, lc.gold.next]);
          }
        }
      }
    }
  }
  return rows;
}
