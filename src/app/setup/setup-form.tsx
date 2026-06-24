"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card, CardContent, Input, Label } from "@/components/ui";
import { useI18n } from "@/components/providers";

export function SetupForm() {
  const router = useRouter();
  const { dict } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/setup", {
        method: "POST",
        body: { name: fd.get("name"), email: fd.get("email"), password: fd.get("password") },
      });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">{dict.setup.name}</Label>
            <Input id="name" name="name" required placeholder="Jane Admin" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{dict.setup.email}</Label>
            <Input id="email" name="email" type="email" required placeholder="admin@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{dict.setup.password}</Label>
            <Input id="password" name="password" type="password" required minLength={8} placeholder={dict.setup.passwordHint} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? dict.setup.creating : dict.setup.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
