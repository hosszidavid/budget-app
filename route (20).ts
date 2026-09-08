import { getCurrentUser } from "@/lib/auth";
import { buildCategoryPath } from "@/lib/categories";
import { recognizeReceiptWithGemini } from "@/lib/gemini-receipt";
import { prisma } from "@/lib/prisma";
import { cleanupIncomingReceiptImages, readIncomingReceiptImage, saveIncomingReceiptImage } from "@/lib/receipt-image";
import { applyReceiptStructureRules } from "@/lib/receipt-structure";
import { normalizeReceiptLabel, normalizeText } from "@/lib/text";
import { z } from "zod";

const ALLOWED = new Set(["image/jpeg","image/jpg","image/png","image/webp","image/heic","image/heif"]);
const MAX_BYTES = 12 * 1024 * 1024;
const tokenSchema = z.object({ imageToken: z.string().uuid() });

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });

  await cleanupIncomingReceiptImages(user.id).catch(()=>{});

  let bytes: Buffer;
  let mimeType: string;
  let originalName: string;
  let existingImageToken: string | null = null;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const parsed = tokenSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Érvénytelen blokkfeltöltés." }, { status: 400 });
    try {
      const incoming = await readIncomingReceiptImage(user.id, parsed.data.imageToken);
      bytes = incoming.bytes;
      mimeType = incoming.mimeType;
      originalName = incoming.originalName;
      existingImageToken = parsed.data.imageToken;
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "A feltöltött blokkfotó nem olvasható." }, { status: 400 });
    }
  } else {
    const form = await request.formData().catch(() => null);
    const file = form?.get("image");
    if (!(file instanceof File)) return Response.json({ error: "Válassz egy blokkfotót." }, { status: 400 });
    if (!ALLOWED.has(file.type)) return Response.json({ error: "JPEG, PNG, WebP vagy HEIC blokkfotó használható." }, { status: 415 });
    if (file.size <= 0 || file.size > MAX_BYTES) return Response.json({ error: "A blokkfotó legfeljebb 12 MB lehet." }, { status: 413 });
    bytes = Buffer.from(await file.arrayBuffer());
    mimeType = file.type;
    originalName = file.name;
  }

  if (!ALLOWED.has(mimeType)) return Response.json({ error: "A feltöltött fájl formátuma nem támogatott." }, { status: 415 });
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_BYTES) return Response.json({ error: "A blokkfotó legfeljebb 12 MB lehet." }, { status: 413 });

  const [categoryRows, itemRows] = await Promise.all([
    prisma.categoryNode.findMany({ where:{ userId:user.id, kind:"EXPENSE", archivedAt:null }, orderBy:[{depth:"asc"},{name:"asc"}] }),
    prisma.reusableItem.findMany({ where:{ userId:user.id, kind:"EXPENSE", archivedAt:null }, orderBy:[{usageCount:"desc"},{lastUsedAt:"desc"}], take:350 }),
  ]);
  const categories = categoryRows.map(c => ({ id:c.id, path:buildCategoryPath(c.id, categoryRows) }));
  const pathByCategory = new Map(categories.map(c=>[c.id,c.path]));
  const items = itemRows.map(i => ({ id:i.id, name:i.name, categoryId:i.categoryId, categoryPath:i.categoryId ? pathByCategory.get(i.categoryId)||"" : "" }));

  try {
    const recognized = await recognizeReceiptWithGemini({ bytes, mimeType, categories, items, model:user.geminiModel });

    const merchantNormalized = normalizeText(recognized.merchant);
    const [mappings, structureRules] = await Promise.all([
      prisma.receiptMapping.findMany({ where:{ userId:user.id, merchantNormalized:{in:[merchantNormalized || "*","*"]} }, orderBy:[{merchantNormalized:"desc"},{updatedAt:"desc"},{usageCount:"desc"}] }),
      prisma.receiptStructureRule.findMany({ where:{ userId:user.id, merchantNormalized:{in:[merchantNormalized || "*","*"]} }, orderBy:{updatedAt:"desc"} }),
    ]);

    const byRaw = new Map<string, typeof mappings[number]>();
    for (const m of mappings) {
      const key = `${m.merchantNormalized}|${m.rawNormalized}`;
      if (!byRaw.has(key)) byRaw.set(key,m);
    }
    for (const line of recognized.lines) {
      const raw = line.rawLabel;
      const exact=normalizeText(raw), simple=normalizeReceiptLabel(raw);
      const m = byRaw.get(`${merchantNormalized}|${exact}`) ?? byRaw.get(`${merchantNormalized}|${simple}`) ?? byRaw.get(`*|${exact}`) ?? byRaw.get(`*|${simple}`);
      if (!m) continue;
      line.label = m.label;
      line.categoryId = m.categoryId;
      line.categoryPath = m.categoryId ? pathByCategory.get(m.categoryId)||"" : "";
      line.reusableItemId = m.reusableItemId;
      line.isDairy = m.isDairy;
      line.containsEgg = m.containsEgg;
      line.containsAnimal = m.containsAnimal;
      line.isAlcohol = m.isAlcohol;
      line.isFrozen = m.isFrozen;
      line.isCanned = m.isCanned;
      line.isPackaged = m.isPackaged;
      line.source = "MAPPING";
      line.confidence = 1;
      line.components = [{ rawLabel:line.rawLabel,label:line.label,amount:line.amount,reusableItemId:line.reusableItemId,categoryId:line.categoryId,categoryPath:line.categoryPath,source:line.source,confidence:line.confidence,isDairy:line.isDairy,containsEgg:line.containsEgg,containsAnimal:line.containsAnimal,isAlcohol:line.isAlcohol,isFrozen:line.isFrozen,isCanned:line.isCanned,isPackaged:line.isPackaged }];
    }

    recognized.lines = applyReceiptStructureRules(recognized.lines, structureRules, merchantNormalized || "*", pathByCategory);
    const partialRecognition = recognized.declaredTotal > 0 && recognized.lines.length === 0;
    const saved = existingImageToken
      ? { token: existingImageToken }
      : await saveIncomingReceiptImage(user.id, bytes, mimeType, originalName);

    return Response.json({
      ok:true,
      partialRecognition,
      warning:partialRecognition ? "A blokk végösszegét felismerte a rendszer, de egyetlen használható tételsort sem tudott kiolvasni. Próbáld újra ugyanazzal a képpel vagy nyisd meg ellenőrzéshez." : null,
      imageToken:saved.token,
      imageOriginalName:originalName,
      imageMimeType:mimeType,
      ...recognized,
    });
  } catch (error) {
    console.error("receipt recognition failed", error);
    return Response.json({ error:error instanceof Error ? error.message : "A blokk felismerése nem sikerült." }, { status: 502 });
  }
}
