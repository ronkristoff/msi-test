"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function useAutoDismissMessage(ms: number) {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const show = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), ms);
  };

  return { message, show };
}

export function MembersTab() {
  const members = useQuery(api.members.queries.getMembers);
  const currentMember = useQuery(api.members.queries.getCurrentMember);
  const removeMember = useMutation(api.members.mutations.removeMember);
  const regenerateInviteCode = useMutation(api.members.mutations.regenerateInviteCode);
  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);
  const { message, show: showMsg } = useAutoDismissMessage(3000);
  const [copied, setCopied] = useState(false);

  if (members === undefined || currentMember === undefined || workspace === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  const isOwner = currentMember?.role === "owner";

  const handleCopyCode = async () => {
    if (!workspace?.invite_code) return;
    await navigator.clipboard.writeText(workspace.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    try {
      await regenerateInviteCode();
      showMsg("success", "Invite code regenerated");
    } catch (err) {
      showMsg("error", err instanceof Error ? err.message : "Failed to regenerate");
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      await removeMember({ member_id: memberId as never });
    } catch (err) {
      showMsg("error", err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  return (
    <div className="max-w-[720px]">
      {message && (
        <Alert variant={message.type} className="mb-5">{message.text}</Alert>
      )}

      {isOwner && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] mb-5">
          <h3 className="text-sm font-semibold text-[var(--fg)] mb-3">Invite Teammates</h3>
          <p className="text-sm text-[var(--muted)] mb-4">
            Share this invite code with teammates so they can join your workspace.
          </p>
          {workspace?.invite_code ? (
            <div className="flex items-center gap-3">
              <code className="px-4 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-mono tracking-wider">
                {workspace.invite_code}
              </code>
              <Button variant="ghost" onClick={handleCopyCode}>
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button variant="ghost" onClick={handleRegenerate}>
                Regenerate
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={handleRegenerate}>
              Generate invite code
            </Button>
          )}
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
        <h3 className="text-sm font-semibold text-[var(--fg)] mb-4">
          Team Members ({members?.length ?? 0})
        </h3>
        <div className="divide-y divide-[var(--border-soft)]">
          {members?.map((member) => (
            <div key={member._id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] grid place-items-center text-xs font-bold uppercase">
                  {member.user_name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--fg)]">{member.user_name}</div>
                  <div className="text-xs text-[var(--muted)] capitalize">{member.role}</div>
                </div>
              </div>
              {isOwner && member.role !== "owner" && (
                <Button variant="ghost" onClick={() => handleRemove(member._id)} className="text-[var(--danger)]">
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
