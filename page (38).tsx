import { IncomeForm } from "@/components/IncomeForm";
import { requireUser } from "@/lib/auth";
import { buildCategoryPath } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
export default async function AddIncomePage(){const user=await requireUser();const [people,categories]=await Promise.all([prisma.person.findMany({where:{userId:user.id,archivedAt:null},orderBy:{name:"asc"}}),prisma.categoryNode.findMany({where:{userId:user.id,kind:"INCOME",archivedAt:null},orderBy:{name:"asc"}})]);return <main className="page"><div className="page-head"><div><div className="eyebrow">Új bevitel</div><h1 className="page-title">Bevétel</h1><p className="muted">Példa: Dávid › Fotózás › Naturklang, 800 CHF.</p></div></div><IncomeForm people={people} categories={categories.map(c=>({id:c.id,path:buildCategoryPath(c.id,categories)}))}/></main>}
