"use client";

/**
 * Hierarchical category picker used by expense and receipt entry.
 * It replaces the long flat <select> with a searchable tree that is easier to
 * understand on both desktop and mobile. Any level may be selected because the
 * budget model intentionally allows terminal categories at depth 1–3.
 */
import { useMemo, useState } from "react";

type CategoryOption = {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  path: string;
  color?: string | null;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("hu-HU")
    .trim();
}

export function CategoryPicker({
  categories,
  value,
  onChange,
  allowClear = false,
  required = false,
  compact = false,
}: {
  categories: CategoryOption[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  allowClear?: boolean;
  required?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const selected = value ? byId.get(value) : undefined;

  const children = useMemo(
    () => categories.filter(c => c.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, "hu")),
    [categories, parentId],
  );

  const searchResults = useMemo(() => {
    const q = normalize(query);
    if (!q) return [];
    return categories
      .filter(c => normalize(`${c.name} ${c.path}`).includes(q))
      .sort((a, b) => {
        const an = normalize(a.name), bn = normalize(b.name);
        const aExact = an === q ? 0 : an.startsWith(q) ? 1 : 2;
        const bExact = bn === q ? 0 : bn.startsWith(q) ? 1 : 2;
        return aExact - bExact || a.depth - b.depth || a.path.localeCompare(b.path, "hu");
      })
      .slice(0, 40);
  }, [categories, query]);

  const breadcrumb = useMemo(() => {
    const result: CategoryOption[] = [];
    let current = parentId ? byId.get(parentId) : undefined;
    let guard = 0;
    while (current && guard++ < 8) {
      result.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return result;
  }, [parentId, byId]);

  function select(id: string | null) {
    onChange(id);
    setOpen(false);
    setQuery("");
    setParentId(null);
  }

  function drill(category: CategoryOption) {
    const hasChildren = categories.some(c => c.parentId === category.id);
    if (hasChildren) {
      setParentId(category.id);
      setQuery("");
    } else {
      select(category.id);
    }
  }

  return <div className={`category-picker ${compact ? "compact" : ""}`}>
    <button
      type="button"
      className={`category-picker-trigger ${!selected && required ? "required-empty" : ""}`}
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
    >
      <span className="category-picker-trigger-copy">
        {selected?.color && <i className="category-picker-dot" style={{ background: selected.color }} />}
        <span>
          <strong>{selected?.name ?? (required ? "Kategória kiválasztása" : "Nincs kategorizálva")}</strong>
          {selected && <small>{selected.path}</small>}
          {!selected && required && <small>Kötelező a mentéshez</small>}
        </span>
      </span>
      <b aria-hidden="true">›</b>
    </button>

    {open && <>
      <button className="category-picker-backdrop" aria-label="Kategóriaválasztó bezárása" onClick={() => setOpen(false)} />
      <section className="category-picker-dialog" role="dialog" aria-modal="true" aria-label="Kategória kiválasztása">
        <div className="category-picker-head">
          <div>
            <div className="eyebrow">Kategória</div>
            <h3>Kategória kiválasztása</h3>
          </div>
          <button className="ghost category-picker-close" type="button" onClick={() => setOpen(false)}>×</button>
        </div>

        <div className="category-picker-search">
          <span>⌕</span>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Keresés név vagy útvonal alapján…" />
        </div>

        {!query && <div className="category-picker-breadcrumbs">
          <button type="button" className={!parentId ? "active" : ""} onClick={() => setParentId(null)}>Fő kategóriák</button>
          {breadcrumb.map(c => <span key={c.id}><i>›</i><button type="button" onClick={() => setParentId(c.id)}>{c.name}</button></span>)}
        </div>}

        <div className="category-picker-list">
          {(query ? searchResults : children).map(category => {
            const hasChildren = categories.some(c => c.parentId === category.id);
            return <div className="category-picker-row" key={category.id}>
              <button type="button" className="category-picker-select" onClick={() => select(category.id)}>
                <i className="category-picker-dot" style={{ background: category.color ?? "#b8bec7" }} />
                <span><strong>{category.name}</strong><small>{category.path}</small></span>
                {value === category.id && <em>Kiválasztva</em>}
              </button>
              {hasChildren && <button type="button" className="category-picker-drill" aria-label={`${category.name} alkategóriái`} onClick={() => drill(category)}>›</button>}
            </div>;
          })}
          {(query ? searchResults : children).length === 0 && <div className="category-picker-empty">Nincs találat.</div>}
        </div>

        <div className="category-picker-foot">
          {parentId && !query && <button className="secondary" type="button" onClick={() => setParentId(byId.get(parentId)?.parentId ?? null)}>‹ Vissza</button>}
          {allowClear && <button className="ghost" type="button" onClick={() => select(null)}>Kategória törlése</button>}
        </div>
      </section>
    </>}
  </div>;
}
