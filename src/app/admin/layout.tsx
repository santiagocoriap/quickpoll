import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { AdminNav } from "@/components/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user.role)) redirect("/me");

  return (
    <div className="min-h-screen bg-muted/20">
      <AdminNav user={{ name: user.name, role: user.role }} />
      <main className="container py-8">{children}</main>
    </div>
  );
}
