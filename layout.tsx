import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <AppShell>{children}</AppShell>;
}
