import { redirect } from "next/navigation";
import { isSetupComplete, getCurrentUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isSetupComplete())) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isAdmin(user.role)) redirect("/admin");
  redirect("/me");
}
