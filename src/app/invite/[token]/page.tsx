import { prisma } from "@/lib/db";
import { Vote } from "lucide-react";
import { getDict } from "@/lib/i18n-server";
import { Controls } from "@/components/controls";
import { InviteForm } from "./invite-form";
import { Card, CardContent } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const dict = getDict();
  const invite = await prisma.invite.findUnique({
    where: { token: params.token },
    include: { poll: { select: { title: true } } },
  });

  const invalid =
    !invite ||
    (invite.expiresAt && invite.expiresAt < new Date()) ||
    invite.uses >= invite.maxUses;

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
          <h1 className="text-2xl font-bold tracking-tight">{dict.invite.title}</h1>
          {invite?.poll && <p className="mt-1 text-sm text-muted-foreground">{dict.invite.invitedTo(invite.poll.title)}</p>}
        </div>
        {invalid ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">{dict.invite.invalid}</CardContent>
          </Card>
        ) : (
          <InviteForm token={params.token} presetEmail={invite!.email ?? ""} />
        )}
      </div>
    </main>
  );
}
