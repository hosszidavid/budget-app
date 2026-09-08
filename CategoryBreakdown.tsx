"use client";

import { formatMoney } from "@/lib/money";
import { useState } from "react";

type Node = {
  id: string;
  name: string;
  color: string;
  depth: number;
  totals: [string, number][];
  children: Node[];
};

function Money({ totals }: { totals: [string, number][] }) {
  return <div className="category-money">{totals.map(([currency, value]) => <span key={currency}>{formatMoney(value, currency)}</span>)}</div>;
}

function Row({ node, defaultOpen = false }: { node: Node; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const expandable = node.children.length > 0;
  return <div className={`breakdown-node depth-${node.depth}`}>
    <button className="breakdown-row" onClick={() => expandable && setOpen(v => !v)} disabled={!expandable}>
      <span className="breakdown-left">
        <span className="breakdown-chevron">{expandable ? (open ? "⌄" : "›") : ""}</span>
        <span className="category-swatch" style={{ background: node.color }} />
        <span>{node.name}</span>
      </span>
      <Money totals={node.totals} />
    </button>
    {open && node.children.length > 0 && <div className="breakdown-children">{node.children.map(child => <Row key={child.id} node={child} />)}</div>}
  </div>;
}

export function CategoryBreakdown({ nodes, uncategorized }: { nodes: Node[]; uncategorized?: Node | null }) {
  if (!nodes.length && !uncategorized) return <p className="muted empty-state">Ebben az időszakban még nincs kiadás.</p>;
  return <div className="breakdown-list">
    {nodes.map((node, index) => <Row key={node.id} node={node} defaultOpen={index === 0} />)}
    {uncategorized && <Row node={uncategorized} />}
  </div>;
}
