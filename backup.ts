/**
 * Portable user-data backup and import helpers.
 * Password hashes and sessions are deliberately excluded.
 * All imported ownership is rewritten to the currently authenticated user.
 */
import { randomUUID } from "node:crypto";
import { del } from "@vercel/blob";
import { prisma } from "./prisma";
import { readReceiptImage } from "./receipt-image";

export const BACKUP_SCHEMA_VERSION = 1;

export type BudgetBackup = {
  format: "budget-app-backup";
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  dataSpaceId: string;
  user: { baseCurrency: string; geminiModel: string };
  data: Record<string, any[]>;
};

function plain<T>(value: T): any {
  return JSON.parse(JSON.stringify(value));
}

export async function buildBackup(userId: string, includeImages = false): Promise<BudgetBackup> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true, geminiModel: true, dataSpaceId: true } });
  const [people, merchants, balanceLocations, categories, reusableItems, receipts, receiptMappings, receiptStructureRules, expensePurchases, incomeEntries, monthSnapshots] = await Promise.all([
    prisma.person.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.merchant.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.balanceLocation.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.categoryNode.findMany({ where: { userId }, orderBy: [{ depth: "asc" }, { createdAt: "asc" }] }),
    prisma.reusableItem.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.receipt.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.receiptMapping.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.receiptStructureRule.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.expensePurchase.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.incomeEntry.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.monthSnapshot.findMany({ where: { userId }, orderBy: [{ year: "asc" }, { month: "asc" }] }),
  ]);
  const receiptIds = receipts.map(r => r.id);
  const purchaseIds = expensePurchases.map(r => r.id);
  const snapshotIds = monthSnapshots.map(r => r.id);
  const [receiptLines, expenseItems, balanceEntries, imageRows] = await Promise.all([
    receiptIds.length ? prisma.receiptLine.findMany({ where: { receiptId: { in: receiptIds } }, orderBy: { createdAt: "asc" } }) : [],
    purchaseIds.length ? prisma.expenseItem.findMany({ where: { purchaseId: { in: purchaseIds } }, orderBy: { createdAt: "asc" } }) : [],
    snapshotIds.length ? prisma.balanceEntry.findMany({ where: { snapshotId: { in: snapshotIds } }, orderBy: { createdAt: "asc" } }) : [],
    includeImages ? prisma.receiptImage.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }) : [],
  ]);
  const exportedReceipts = receipts.map(row => ({ ...row }));
  const receiptImages: any[] = [];
  if (includeImages) {
    for (const row of imageRows) {
      try {
        const data = row.data ? Buffer.from(row.data) : await readReceiptImage(`db:${row.id}`, userId);
        const plainRow = plain(row);
        receiptImages.push({ ...plainRow, data: data.toString("base64"), blobUrl: null, blobPathname: null });
      } catch {}
    }
    const knownKeys = new Set(receiptImages.map(row => `db:${row.id}`));
    for (const receipt of exportedReceipts) {
      if (!receipt.imageStorageKey || knownKeys.has(receipt.imageStorageKey) || receipt.imageStorageKey.startsWith("db:")) continue;
      try {
        const data = await readReceiptImage(receipt.imageStorageKey, userId);
        const id = randomUUID();
        receiptImages.push({ id, userId, receiptId: receipt.id, data: data.toString("base64"), mimeType: receipt.imageMimeType || "image/jpeg", originalName: receipt.imageOriginalName || null, createdAt: receipt.createdAt, updatedAt: receipt.updatedAt });
        receipt.imageStorageKey = `db:${id}`;
      } catch {}
    }
  } else {
    for (const receipt of exportedReceipts) { receipt.imageStorageKey = null; receipt.imageMimeType = null; receipt.imageOriginalName = null; }
  }
  return {
    format: "budget-app-backup",
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: "0.14.0",
    dataSpaceId: user.dataSpaceId,
    user: { baseCurrency: user.baseCurrency, geminiModel: user.geminiModel },
    data: plain({ people, merchants, balanceLocations, categories, reusableItems, receipts: exportedReceipts, receiptLines, receiptMappings, receiptStructureRules, expensePurchases, expenseItems, incomeEntries, monthSnapshots, balanceEntries, receiptImages }),
  };
}

function requireIdRows(rows: any[], label: string) {
  for (const row of rows) if (!row || typeof row.id !== "string" || row.id.length < 8) throw new Error(`Sérült backup: hiányzó ${label} azonosító.`);
}
function validateBackupRelations(backup: BudgetBackup) {
  const d = backup.data;
  const sets = {
    people:new Set(d.people.map((r:any)=>r.id)), merchants:new Set(d.merchants.map((r:any)=>r.id)), locations:new Set(d.balanceLocations.map((r:any)=>r.id)),
    categories:new Set(d.categories.map((r:any)=>r.id)), items:new Set(d.reusableItems.map((r:any)=>r.id)), receipts:new Set(d.receipts.map((r:any)=>r.id)),
    purchases:new Set(d.expensePurchases.map((r:any)=>r.id)), snapshots:new Set(d.monthSnapshots.map((r:any)=>r.id)),
  };
  const belongs=(value:any,set:Set<any>)=>value==null||set.has(value);
  for(const r of d.categories) if(!belongs(r.parentId,sets.categories)) throw new Error("Sérült backup: kategória szülő-hivatkozás kívül mutat az adathalmazon.");
  for(const r of d.reusableItems) if(!belongs(r.categoryId,sets.categories)) throw new Error("Sérült backup: reusable item kategória-hivatkozás hibás.");
  for(const r of d.receipts) if(!belongs(r.personId,sets.people)||!belongs(r.merchantId,sets.merchants)) throw new Error("Sérült backup: blokk személy/bolt hivatkozás hibás.");
  for(const r of d.receiptLines) if(!sets.receipts.has(r.receiptId)||!belongs(r.categoryId,sets.categories)||!belongs(r.reusableItemId,sets.items)) throw new Error("Sérült backup: blokk-tétel hivatkozás hibás.");
  for(const r of d.expensePurchases) if(!belongs(r.personId,sets.people)||!belongs(r.merchantId,sets.merchants)||!belongs(r.receiptId,sets.receipts)) throw new Error("Sérült backup: kiadás hivatkozás hibás.");
  for(const r of d.expenseItems) if(!sets.purchases.has(r.purchaseId)||!belongs(r.categoryId,sets.categories)||!belongs(r.reusableItemId,sets.items)) throw new Error("Sérült backup: kiadási tétel hivatkozás hibás.");
  for(const r of d.incomeEntries) if(!sets.people.has(r.personId)||!belongs(r.categoryId,sets.categories)) throw new Error("Sérült backup: bevétel hivatkozás hibás.");
  for(const r of d.balanceEntries) if(!sets.snapshots.has(r.snapshotId)||!belongs(r.personId,sets.people)||!belongs(r.locationId,sets.locations)) throw new Error("Sérült backup: egyenleg hivatkozás hibás.");
  for(const r of d.receiptMappings) if(!belongs(r.categoryId,sets.categories)||!belongs(r.reusableItemId,sets.items)) throw new Error("Sérült backup: mapping hivatkozás hibás.");
  for(const r of d.receiptStructureRules) if(!belongs(r.targetCategoryId,sets.categories)||!belongs(r.targetReusableItemId,sets.items)) throw new Error("Sérült backup: struktúra-szabály hivatkozás hibás.");
  for(const r of d.receiptImages) if(!belongs(r.receiptId,sets.receipts)) throw new Error("Sérült backup: blokk-kép hivatkozás hibás.");
  const imageById=new Map(d.receiptImages.map((r:any)=>[r.id,r]));
  for(const r of d.receipts){
    if(typeof r.imageStorageKey==="string"&&r.imageStorageKey.startsWith("db:")){
      const image=imageById.get(r.imageStorageKey.slice(3));
      if(!image||image.receiptId!==r.id) throw new Error("Sérült backup: a blokk képazonosítója nem egyezik a kép rekorddal.");
    }
  }
}
export function parseBackup(value: any): BudgetBackup {
  if (!value || value.format !== "budget-app-backup" || value.schemaVersion !== BACKUP_SCHEMA_VERSION || !value.data || typeof value.data !== "object") throw new Error("Nem támogatott vagy sérült Budget backup.");
  if (typeof value.dataSpaceId !== "string" || value.dataSpaceId.length < 8) throw new Error("Sérült backup: hiányzó adattér-azonosító.");
  const keys = ["people","merchants","balanceLocations","categories","reusableItems","receipts","receiptLines","receiptMappings","receiptStructureRules","expensePurchases","expenseItems","incomeEntries","monthSnapshots","balanceEntries","receiptImages"];
  for (const key of keys) if (!Array.isArray(value.data[key])) value.data[key] = [];
  for(const key of keys) requireIdRows(value.data[key],key);
  validateBackupRelations(value as BudgetBackup);
  return value as BudgetBackup;
}

export function backupSummary(backup: BudgetBackup) {
  const d = backup.data;
  return {
    exportedAt: backup.exportedAt,
    appVersion: backup.appVersion,
    dataSpaceId: backup.dataSpaceId,
    counts: {
      expenses: d.expensePurchases.length,
      expenseItems: d.expenseItems.length,
      incomes: d.incomeEntries.length,
      receipts: d.receipts.length,
      receiptLines: d.receiptLines.length,
      categories: d.categories.length,
      reusableItems: d.reusableItems.length,
      mappings: d.receiptMappings.length + d.receiptStructureRules.length,
      snapshots: d.monthSnapshots.length,
      images: d.receiptImages.length,
    },
  };
}

const dateKeys = new Set(["createdAt","updatedAt","archivedAt","lastUsedAt","purchaseDate","aiProcessedAt","date","fxDate","deletedAt","closedAt"]);
function hydrate(row: any) {
  const out: any = { ...row };
  for (const [key, value] of Object.entries(out)) if (value && dateKeys.has(key) && typeof value === "string") out[key] = new Date(value);
  return out;
}
function own(row: any, userId: string) { const { userId: _old, ...rest } = hydrate(row); return { ...rest, userId }; }

async function clearUserData(tx: any, userId: string) {
  await tx.receiptImage.deleteMany({ where: { userId } });
  await tx.receiptStructureRule.deleteMany({ where: { userId } });
  await tx.receiptMapping.deleteMany({ where: { userId } });
  await tx.expensePurchase.deleteMany({ where: { userId } });
  await tx.incomeEntry.deleteMany({ where: { userId } });
  await tx.monthSnapshot.deleteMany({ where: { userId } });
  await tx.receipt.deleteMany({ where: { userId } });
  await tx.reusableItem.deleteMany({ where: { userId } });
  for (const depth of [3,2,1,0]) await tx.categoryNode.deleteMany({ where: { userId, depth } });
  await tx.categoryNode.deleteMany({ where: { userId } });
  await tx.merchant.deleteMany({ where: { userId } });
  await tx.person.deleteMany({ where: { userId } });
  await tx.balanceLocation.deleteMany({ where: { userId } });
}

async function createAll(tx: any, userId: string, backup: BudgetBackup) {
  const d = backup.data;
  for (const row of d.people) await tx.person.create({ data: own(row, userId) });
  for (const row of d.merchants) await tx.merchant.create({ data: own(row, userId) });
  for (const row of d.balanceLocations) await tx.balanceLocation.create({ data: own(row, userId) });
  for (const row of [...d.categories].sort((a,b)=>(a.depth??0)-(b.depth??0))) await tx.categoryNode.create({ data: own(row, userId) });
  for (const row of d.reusableItems) await tx.reusableItem.create({ data: own(row, userId) });
  for (const row of d.receipts) await tx.receipt.create({ data: own(row, userId) });
  for (const row of d.receiptLines) await tx.receiptLine.create({ data: hydrate(row) });
  for (const row of d.expensePurchases) await tx.expensePurchase.create({ data: own(row, userId) });
  for (const row of d.expenseItems) await tx.expenseItem.create({ data: hydrate(row) });
  for (const row of d.incomeEntries) await tx.incomeEntry.create({ data: own(row, userId) });
  for (const row of d.monthSnapshots) await tx.monthSnapshot.create({ data: own(row, userId) });
  for (const row of d.balanceEntries) await tx.balanceEntry.create({ data: hydrate(row) });
  for (const row of d.receiptMappings) await tx.receiptMapping.create({ data: own(row, userId) });
  for (const row of d.receiptStructureRules) await tx.receiptStructureRule.create({ data: own(row, userId) });
  for (const row of d.receiptImages) {
    const data = Buffer.from(String(row.data || ""), "base64");
    const { data: _encoded, blobUrl: _blobUrl, blobPathname: _blobPathname, ...rest } = row;
    await tx.receiptImage.create({ data: { ...own(rest, userId), data, blobUrl: null, blobPathname: null, sizeBytes: data.byteLength } });
  }
}

export async function replaceFromBackup(userId: string, backup: BudgetBackup) {
  const oldBlobRows = await prisma.receiptImage.findMany({ where: { userId, blobUrl: { not: null } }, select: { blobUrl: true } });
  await prisma.$transaction(async tx => {
    await clearUserData(tx, userId);
    await createAll(tx, userId, backup);
    await tx.user.update({ where: { id: userId }, data: { baseCurrency: backup.user?.baseCurrency || "CHF", geminiModel: ["gemini-3.5-flash","gemini-3.6-flash"].includes(backup.user?.geminiModel) ? backup.user.geminiModel : "gemini-3.5-flash", dataSpaceId: backup.dataSpaceId } });
  }, { timeout: 120000 });
  for (const row of oldBlobRows) if (row.blobUrl) await del(row.blobUrl).catch(() => {});
}

function timestamp(value: any) {
  const raw = value?.updatedAt || value?.createdAt || "";
  if (!raw) return "";
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? String(raw) : date.toISOString();
}
function sameTimestamp(a: any, b: any) { return timestamp(a) === timestamp(b); }

export async function mergeFromBackup(userId: string, currentDataSpaceId: string, backup: BudgetBackup) {
  if (backup.dataSpaceId !== currentDataSpaceId) throw new Error("A Merge csak ugyanahhoz az adatbázis-térhez tartozó backupok között engedélyezett. Első költöztetéshez használd a Restore / csere módot.");
  const conflicts: { type: string; id: string; reason: string }[] = [];
  let created = 0, skipped = 0;
  const d = backup.data;
  await prisma.$transaction(async tx => {
    async function mergeRows(type: string, delegate: any, rows: any[], owns: boolean) {
      for (const source of rows) {
        const existing = await delegate.findUnique({ where: { id: source.id } }).catch(() => null);
        if (existing) {
          if (owns && existing.userId !== userId) { conflicts.push({ type, id: source.id, reason: "Az azonosító másik felhasználóhoz tartozik." }); continue; }
          if (sameTimestamp(existing, source)) { skipped++; continue; }
          conflicts.push({ type, id: source.id, reason: "A helyi és az importált rekord is létezik, eltérő módosítási idővel." });
          continue;
        }
        try { await delegate.create({ data: owns ? own(source, userId) : hydrate(source) }); created++; }
        catch (error) { conflicts.push({ type, id: source.id, reason: error instanceof Error ? error.message.slice(0,180) : "Létrehozási ütközés." }); }
      }
    }
    await mergeRows("person", tx.person, d.people, true);
    await mergeRows("merchant", tx.merchant, d.merchants, true);
    await mergeRows("balanceLocation", tx.balanceLocation, d.balanceLocations, true);
    for (const depth of [1,2,3]) await mergeRows("category", tx.categoryNode, d.categories.filter((r:any)=>r.depth===depth), true);
    await mergeRows("reusableItem", tx.reusableItem, d.reusableItems, true);
    await mergeRows("receipt", tx.receipt, d.receipts, true);
    await mergeRows("receiptLine", tx.receiptLine, d.receiptLines, false);
    await mergeRows("expensePurchase", tx.expensePurchase, d.expensePurchases, true);
    await mergeRows("expenseItem", tx.expenseItem, d.expenseItems, false);
    await mergeRows("incomeEntry", tx.incomeEntry, d.incomeEntries, true);
    await mergeRows("monthSnapshot", tx.monthSnapshot, d.monthSnapshots, true);
    await mergeRows("balanceEntry", tx.balanceEntry, d.balanceEntries, false);
    await mergeRows("receiptMapping", tx.receiptMapping, d.receiptMappings, true);
    await mergeRows("receiptStructureRule", tx.receiptStructureRule, d.receiptStructureRules, true);
    for (const row of d.receiptImages) {
      const existing = await tx.receiptImage.findUnique({ where: { id: row.id } }).catch(()=>null);
      if (existing) { if (sameTimestamp(existing,row)) skipped++; else conflicts.push({type:"receiptImage",id:row.id,reason:"Eltérő képverzió."}); continue; }
      try { const { data: encoded, blobUrl: _blobUrl, blobPathname: _blobPathname, ...rest } = row; const data=Buffer.from(String(encoded||""),"base64"); await tx.receiptImage.create({ data: { ...own(rest,userId), data, blobUrl:null, blobPathname:null, sizeBytes:data.byteLength } }); created++; }
      catch (error) { conflicts.push({type:"receiptImage",id:row.id,reason:error instanceof Error?error.message.slice(0,180):"Képütközés."}); }
    }
  }, { timeout: 120000 });
  return { created, skipped, conflicts };
}
