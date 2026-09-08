import { CategoryAmountBehavior, CategoryKind, Prisma, PrismaClient } from "@prisma/client";
import { normalizeText } from "./text";

type Node = { name: string; color?: string; amountBehavior?: CategoryAmountBehavior; children?: Node[] };
type Db = PrismaClient | Prisma.TransactionClient;

const expenseTree: Node[] = [
  {
    name: "Étel és ital",
    color: "#A9C6A5",
    children: [
      { name: "Gyümölcs", children: [
        { name: "Alma" }, { name: "Banán" }, { name: "Kiwi" }, { name: "Szőlő" }, { name: "Körte" },
        { name: "Citrusfélék" }, { name: "Bogyós gyümölcsök" }, { name: "Barackfélék / csonthéjasok" },
        { name: "Dinnye" }, { name: "Trópusi / egzotikus" }, { name: "Szárított gyümölcs" }, { name: "Egyéb gyümölcs" },
      ]},
      { name: "Zöldség", children: [
        { name: "Paradicsom" }, { name: "Paprika" }, { name: "Uborka" }, { name: "Saláta / leveles zöldség" },
        { name: "Hagymafélék" }, { name: "Káposztafélék" }, { name: "Gyökérzöldségek" }, { name: "Burgonya / édesburgonya" },
        { name: "Cukkini / tök / padlizsán" }, { name: "Gomba" }, { name: "Hüvelyesek" }, { name: "Avokádó" },
        { name: "Kukorica" }, { name: "Egyéb zöldség" },
      ]},
      { name: "Gabona / köret / tészta", children: [
        { name: "Rizs" }, { name: "Tészta" }, { name: "Zab" }, { name: "Bulgur / kuszkusz" },
        { name: "Quinoa / egyéb gabona" }, { name: "Wrap / tortilla" }, { name: "Egyéb gabona / köret" },
      ]},
      { name: "Pékáru", children: [
        { name: "Kenyér" }, { name: "Zsemle / kifli" }, { name: "Péksütemény" }, { name: "Egyéb pékáru" },
      ]},
      { name: "Főzési alapanyag", children: [
        { name: "Liszt" }, { name: "Cukor / édesítő" }, { name: "Olaj / zsiradék" }, { name: "Fűszer" },
        { name: "Szósz / mártás" }, { name: "Paradicsomtermék" }, { name: "Sütési alapanyag" },
        { name: "Tojás" }, { name: "Tofu / növényi alap" }, { name: "Egyéb főzési alapanyag" },
      ]},
      { name: "Fogyasztásra kész", children: [
        { name: "Sajt" }, { name: "Joghurt" }, { name: "Hummusz" }, { name: "Kenhető krém" },
        { name: "Mogyoróvaj / magkrém" }, { name: "Lekvár" }, { name: "Magvak / diófélék" },
        { name: "Olívabogyó / antipasti" }, { name: "Falafel / kész feltét" }, { name: "Egyéb fogyasztásra kész" },
      ]},
      { name: "Nasi / édesség", children: [
        { name: "Csokoládé" }, { name: "Keksz" }, { name: "Cukorka / gumicukor" }, { name: "Chips / sós nasi" },
        { name: "Fagyi" }, { name: "Puding / desszert" }, { name: "Müzli / gabonapehely" },
        { name: "Édes krém / Nutella" }, { name: "Egyéb nasi" },
      ]},
      { name: "Fehérje / energia", children: [
        { name: "Fehérjeszelet" }, { name: "Energiagolyó" }, { name: "Fehérjepor" },
        { name: "Étrend-kiegészítő" }, { name: "Vitamin" }, { name: "Egyéb fehérje / energia" },
      ]},
      { name: "Ital", children: [
        { name: "Víz" }, { name: "Üdítő" }, { name: "Gyümölcslé" }, { name: "Tej / növényi ital" },
        { name: "Kávé" }, { name: "Tea" }, { name: "Energiaital" }, { name: "Alkohol" }, { name: "Egyéb ital" },
      ]},
      { name: "Gyorskaja / étterem", children: [
        { name: "Pizza" }, { name: "Burger" }, { name: "Kebab / falafel" }, { name: "Készétel" },
        { name: "Étterem" }, { name: "Kávézó" }, { name: "Egyéb gyorskaja / étterem" },
      ]},
    ],
  },
  {
    name: "Korrekciók", color: "#E6B8B8", children: [
      { name: "Kedvezmény", children: [
        { name: "Akció", amountBehavior: CategoryAmountBehavior.NEGATIVE },
        { name: "Kupon", amountBehavior: CategoryAmountBehavior.NEGATIVE },
        { name: "Hűségkedvezmény", amountBehavior: CategoryAmountBehavior.NEGATIVE },
        { name: "Egyéb kedvezmény", amountBehavior: CategoryAmountBehavior.NEGATIVE },
      ]},
      { name: "Pfand / betétdíj", children: [
        { name: "Betétdíj", amountBehavior: CategoryAmountBehavior.POSITIVE },
        { name: "Visszaváltás", amountBehavior: CategoryAmountBehavior.NEGATIVE },
      ]},
    ],
  },
  {
    name: "Háztartás", color: "#AFC9E8", children: [
      { name: "Higiénia", children: [{ name: "Szappan" }, { name: "Sampon / hajápolás" }, { name: "Fogápolás" }, { name: "Dezodor" }, { name: "Egyéb higiénia" }] },
      { name: "Takarítás", children: [{ name: "Tisztítószer" }, { name: "Mosás" }, { name: "Mosogatás" }, { name: "Egyéb takarítás" }] },
      { name: "Háztartási fogyóeszköz", children: [{ name: "Papírtermék" }, { name: "Konyhai fogyóeszköz" }, { name: "Szemeteszsák" }, { name: "Egyéb fogyóeszköz" }] },
      { name: "Lakás / felszerelés", children: [{ name: "Bútor" }, { name: "Konyha" }, { name: "Dekoráció" }, { name: "Javítás" }, { name: "Egyéb felszerelés" }] },
    ],
  },
  {
    name: "Számlák és szolgáltatások", color: "#C4B7DD", children: [
      { name: "Lakhatás", children: [{ name: "Lakbér" }, { name: "Egyéb lakhatás" }] },
      { name: "Rezsi", children: [{ name: "Villany" }, { name: "Víz" }, { name: "Fűtés" }, { name: "Egyéb rezsi" }] },
      { name: "Telekommunikáció", children: [{ name: "Internet" }, { name: "Mobil" }, { name: "Egyéb telekommunikáció" }] },
      { name: "Biztosítás" },
      { name: "Előfizetés", children: [{ name: "Szoftver" }, { name: "Streaming" }, { name: "Felhő / tárhely" }, { name: "Egyéb előfizetés" }] },
      { name: "Díjak / szolgáltatások", children: [{ name: "Banki díj" }, { name: "Posta" }, { name: "Egyéb szolgáltatás" }] },
    ],
  },
  {
    name: "Közlekedés", color: "#EDC29E", children: [
      { name: "Autó", children: [{ name: "Üzemanyag - Benzin" }, { name: "Üzemanyag - Dízel" }, { name: "Szerviz" }, { name: "Parkolás" }, { name: "Autópálya / matrica" }, { name: "Autómosás" }, { name: "Egyéb autó" }] },
      { name: "Tömegközlekedés" }, { name: "Taxi / rideshare" }, { name: "Egyéb közlekedés" },
    ],
  },
  { name: "Egészség", color: "#E7B8C3", children: [{ name: "Gyógyszer" }, { name: "Orvos" }, { name: "Fogorvos" }, { name: "Szemészet" }, { name: "Egyéb egészség" }] },
  { name: "Ruházat", color: "#D7C4AA", children: [{ name: "Ruha" }, { name: "Cipő" }, { name: "Kiegészítő" }, { name: "Egyéb ruházat" }] },
  { name: "Szabadidő", color: "#CBBCE6", children: [{ name: "Program" }, { name: "Hobbi" }, { name: "Sport" }, { name: "Könyv / média" }, { name: "Egyéb szabadidő" }] },
  { name: "Utazás", color: "#ABD6D3", children: [{ name: "Szállás" }, { name: "Közlekedés" }, { name: "Étkezés" }, { name: "Program" }, { name: "Egyéb utazás" }] },
  { name: "Állatok", color: "#D7CFA9", children: [{ name: "Étel" }, { name: "Egészség" }, { name: "Felszerelés" }, { name: "Egyéb állatok" }] },
  { name: "Munka", color: "#A9D4C6", children: [{ name: "Fotózás" }, { name: "Eszköz" }, { name: "Szoftver" }, { name: "Utazás" }, { name: "Egyéb munka" }] },
  { name: "Ajándék / adomány", color: "#E7C0CF" },
  { name: "Megtakarítás", color: "#B9D8B4", children: [{ name: "Sparkonto" }, { name: "Egyéb megtakarítás" }] },
  { name: "Egyéb", color: "#D2D3D5" },
];

const incomeTree: Node[] = [
  { name: "Fotózás", color: "#A9D4C6" },
  { name: "Munka / fizetés", color: "#AFC9E8" },
  { name: "Eladás", color: "#EDC29E" },
  { name: "Visszatérítés", color: "#C4B7DD" },
  { name: "Egyéb", color: "#D2D3D5" },
];

const excludedAutoItems = new Set(["Egyéb", "Biztosítás"]);

export async function createDefaultData(prisma: Db, userId: string) {
  await prisma.person.createMany({
    data: ["Dávid", "Petra"].map((name) => ({ userId, name })),
    skipDuplicates: true,
  });

  async function insertTree(nodes: Node[], kind: CategoryKind, parentId: string | null, depth: number, inheritedColor?: string) {
    for (const node of nodes) {
      const color = node.color ?? inheritedColor;
      const category = await prisma.categoryNode.create({
        data: {
          userId,
          kind,
          name: node.name,
          normalized: normalizeText(node.name),
          depth,
          parentId,
          color,
          amountBehavior: node.amountBehavior ?? CategoryAmountBehavior.NORMAL,
        },
      });

      if (node.children?.length) {
        await insertTree(node.children, kind, category.id, depth + 1, color);
      } else if (!excludedAutoItems.has(node.name) && !node.name.toLocaleLowerCase("hu-HU").startsWith("egyéb")) {
        await prisma.reusableItem.upsert({
          where: { userId_kind_normalized: { userId, kind, normalized: normalizeText(node.name) } },
          update: { categoryId: category.id },
          create: {
            userId,
            kind,
            name: node.name,
            normalized: normalizeText(node.name),
            categoryId: category.id,
            isAlcohol: node.name === "Alkohol",
          },
        });
      }
    }
  }

  await insertTree(expenseTree, CategoryKind.EXPENSE, null, 1);
  await insertTree(incomeTree, CategoryKind.INCOME, null, 1);
}

/** v0.2 compatibility patch for accounts that were created with the v0.1 seed. */
export async function ensureV02Defaults(prisma: Db, userId: string) {
  const transport = await prisma.categoryNode.findFirst({
    where: { userId, kind: CategoryKind.EXPENSE, normalized: normalizeText("Közlekedés"), parentId: null },
  });
  if (!transport) return;
  const car = await prisma.categoryNode.findFirst({
    where: { userId, kind: CategoryKind.EXPENSE, normalized: normalizeText("Autó"), parentId: transport.id },
  });
  if (!car) return;

  for (const name of ["Üzemanyag - Benzin", "Üzemanyag - Dízel"]) {
    const normalized = normalizeText(name);
    const existing = await prisma.categoryNode.findFirst({
      where: { userId, kind: CategoryKind.EXPENSE, parentId: car.id, normalized },
    });
    const child = existing
      ? await prisma.categoryNode.update({ where: { id: existing.id }, data: { name, archivedAt: null, color: car.color } })
      : await prisma.categoryNode.create({ data: { userId, kind: CategoryKind.EXPENSE, name, normalized, depth: 3, parentId: car.id, color: car.color } });
    await prisma.reusableItem.upsert({
      where: { userId_kind_normalized: { userId, kind: CategoryKind.EXPENSE, normalized } },
      update: { name, categoryId: child.id, archivedAt: null },
      create: { userId, kind: CategoryKind.EXPENSE, name, normalized, categoryId: child.id },
    });
  }

  const oldFuel = await prisma.categoryNode.findFirst({
    where: { userId, kind: CategoryKind.EXPENSE, normalized: normalizeText("Üzemanyag"), parentId: car.id },
  });
  if (oldFuel) {
    const usage = await prisma.expenseItem.count({ where: { categoryId: oldFuel.id } });
    if (usage === 0) {
      await prisma.categoryNode.update({ where: { id: oldFuel.id }, data: { archivedAt: new Date() } });
      await prisma.reusableItem.updateMany({
        where: { userId, kind: CategoryKind.EXPENSE, normalized: normalizeText("Üzemanyag"), usageCount: 0 },
        data: { archivedAt: new Date() },
      });
    }
  }

  // v0.8: correction categories for discounts, coupons and deposit/refund lines.
  const correctionRootName = "Korrekciók";
  const correctionRootNormalized = normalizeText(correctionRootName);
  // Prisma composite unique inputs cannot use NULL for nullable fields.
  // Root category nodes have parentId = null, so resolve the root explicitly
  // instead of using the @@unique([userId, kind, parentId, normalized]) upsert key.
  // This mirrors the safe lookup pattern already used for other root nodes.
  const existingCorrectionRoot = await prisma.categoryNode.findFirst({
    where: {
      userId,
      kind: CategoryKind.EXPENSE,
      parentId: null,
      normalized: correctionRootNormalized,
    },
  });
  const correctionRoot = existingCorrectionRoot
    ? await prisma.categoryNode.update({
        where: { id: existingCorrectionRoot.id },
        data: { name: correctionRootName, archivedAt: null, color: "#E6B8B8" },
      })
    : await prisma.categoryNode.create({
        data: {
          userId,
          kind: CategoryKind.EXPENSE,
          name: correctionRootName,
          normalized: correctionRootNormalized,
          depth: 1,
          parentId: null,
          color: "#E6B8B8",
        },
      });
  const groups = [
    { name: "Kedvezmény", leaves: [
      ["Akció", CategoryAmountBehavior.NEGATIVE], ["Kupon", CategoryAmountBehavior.NEGATIVE], ["Hűségkedvezmény", CategoryAmountBehavior.NEGATIVE], ["Egyéb kedvezmény", CategoryAmountBehavior.NEGATIVE],
    ] as const },
    { name: "Pfand / betétdíj", leaves: [
      ["Betétdíj", CategoryAmountBehavior.POSITIVE], ["Visszaváltás", CategoryAmountBehavior.NEGATIVE],
    ] as const },
  ];
  for (const group of groups) {
    const groupNormalized = normalizeText(group.name);
    const groupNode = await prisma.categoryNode.upsert({
      where: { userId_kind_parentId_normalized: { userId, kind: CategoryKind.EXPENSE, parentId: correctionRoot.id, normalized: groupNormalized } },
      update: { name: group.name, archivedAt: null, color: correctionRoot.color },
      create: { userId, kind: CategoryKind.EXPENSE, name: group.name, normalized: groupNormalized, depth: 2, parentId: correctionRoot.id, color: correctionRoot.color },
    });
    for (const [name, amountBehavior] of group.leaves) {
      const normalized = normalizeText(name);
      const leaf = await prisma.categoryNode.upsert({
        where: { userId_kind_parentId_normalized: { userId, kind: CategoryKind.EXPENSE, parentId: groupNode.id, normalized } },
        update: { name, archivedAt: null, color: correctionRoot.color, amountBehavior },
        create: { userId, kind: CategoryKind.EXPENSE, name, normalized, depth: 3, parentId: groupNode.id, color: correctionRoot.color, amountBehavior },
      });
      await prisma.reusableItem.upsert({
        where: { userId_kind_normalized: { userId, kind: CategoryKind.EXPENSE, normalized } },
        update: { name, categoryId: leaf.id, archivedAt: null },
        create: { userId, kind: CategoryKind.EXPENSE, name, normalized, categoryId: leaf.id },
      });
    }
  }
}
