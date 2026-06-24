import { redirect } from "next/navigation";
import { isSetupComplete, getCurrentUser } from "@/lib/auth";
import { Vote } from "lucide-react";
import { getDict } from "@/lib/i18n-server";
import { Controls } from "@/components/controls";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await isSetupComplete())) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const dict = getDict();
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="absolute right-4 top-4">
        <Controls />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Vote className="size-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">{dict.login.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{dict.login.subtitle}</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
