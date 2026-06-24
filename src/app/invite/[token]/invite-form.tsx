"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card, CardContent, Input, Label } from "@/components/ui";
import { useI18n } from "@/components/providers";

export function InviteForm({ token, presetEmail }: { token: string; presetEmail: string }) {
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
      const res = await api<{ pollId: string | null }>("/api/auth/register", {
        method: "POST",
        body: { token, name: fd.get("name"), email: fd.get("email"), password: fd.get("password") },
      });
      router.push("/me");
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
            <Label htmlFor="name">{dict.invite.name}</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{dict.invite.email}</Label>
            <Input id="email" name="email" type="email" required defaultValue={presetEmail} readOnly={Boolean(presetEmail)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{dict.invite.password}</Label>
            <Input id="password" name="password" type="password" required minLength={8} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? dict.invite.creating : dict.invite.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
