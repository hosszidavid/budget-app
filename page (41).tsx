import { DatabaseManager } from "@/components/DatabaseManager";
import { requireUser } from "@/lib/auth";
import { ensureV02Defaults } from "@/lib/defaults";
import { prisma } from "@/lib/prisma";

export default async function CategoriesPage() {
  const user = await requireUser();
  await ensureV02Defaults(prisma, user.id);
  const [categories, people, merchants] = await Promise.all([
    prisma.categoryNode.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ kind: "asc" }, { depth: "asc" }, { name: "asc" }],
      select: { id: true, kind: true, name: true, parentId: true, depth: true, color: true },
    }),
    prisma.person.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.merchant.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return <main className="page">
    <div className="page-head"><div><div className="eyebrow">Adatbázis</div><h1 className="page-title">Adatbázis kezelő</h1><p className="muted">Kategóriák, személyek, partnerek és a Receipt Engine megtanult szabályai egy helyen. Az AI tanulás fülön a termék-mappingeket és a Split/Merge döntéseket is kontrollálhatod.</p></div></div>
    <DatabaseManager categories={categories} people={people} merchants={merchants} />
  </main>;
}
