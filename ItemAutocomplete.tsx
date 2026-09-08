"use client";

/**
 * Shared item-first autocomplete.
 *
 * The API can return both remembered reusable items and category fallbacks.
 * Category fallbacks are important for generic/terminal categories such as
 * "Egyéb nasi", which may not have their own reusable-item record.
 */
import { useEffect, useRef, useState } from "react";

type Suggestion = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryPath: string;
  defaults: Record<string, boolean>;
  source?: "ITEM" | "CATEGORY";
};

type Value = {
  label: string;
  reusableItemId?: string | null;
  categoryId?: string | null;
  categoryPath?: string;
  defaults?: Record<string, boolean>;
};

export function ItemAutocomplete({
  value,
  onChange,
  kind = "EXPENSE",
  categoryId,
  flowSuggestions = false,
}: {
  value: Value;
  onChange: (next: Value) => void;
  kind?: "EXPENSE" | "INCOME";
  categoryId?: string | null;
  flowSuggestions?: boolean;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const controller = new AbortController();
    const q = value.label.trim();
    if (q.length < 1) {
      setItems([]);
      setOpen(false);
      return () => controller.abort();
    }

    timer.current = setTimeout(async () => {
      const params = new URLSearchParams({ kind, q });
      if (categoryId) params.set("categoryId", categoryId);
      try {
        const res = await fetch(`/api/items?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
        setOpen(Array.isArray(data) && data.length > 0);
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          setItems([]);
          setOpen(false);
        }
      }
    }, 120);

    return () => {
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value.label, kind, categoryId]);

  return <div className={`autocomplete ${flowSuggestions ? "autocomplete-flow" : ""}`}>
    <input
      className="input"
      placeholder={kind === "EXPENSE" ? "pl. alma" : "pl. Naturklang"}
      value={value.label}
      autoComplete="off"
      onChange={e => onChange({
        label: e.target.value,
        reusableItemId: null,
        categoryId: value.categoryId ?? categoryId ?? null,
        categoryPath: value.categoryPath ?? "",
      })}
      onFocus={() => items.length && setOpen(true)}
      onBlur={() => window.setTimeout(() => setOpen(false), 80)}
    />
    {open && items.length > 0 && <div className="suggestions" role="listbox" aria-label="Tételjavaslatok">
      {items.map(item => <button
        type="button"
        className="suggestion"
        key={item.id}
        onMouseDown={(e) => {
          e.preventDefault();
          onChange({
            label: item.name,
            reusableItemId: item.source === "CATEGORY" ? null : item.id,
            categoryId: item.categoryId,
            categoryPath: item.categoryPath,
            defaults: item.defaults,
          });
          setOpen(false);
        }}
      >
        <span className="suggestion-main"><strong>{item.name}</strong>{item.source === "CATEGORY" && <em>Kategória</em>}</span>
        <small>{item.categoryPath}</small>
      </button>)}
    </div>}
  </div>;
}
