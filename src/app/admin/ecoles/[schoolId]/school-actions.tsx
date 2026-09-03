"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { Field, Label, TextInput, Textarea } from "@/components/form";
import { deleteSchoolAction, sendAdminMessageAction, setSchoolBlockedAction } from "@/lib/actions/admin";

type Feedback = { tone: "ok" | "error"; text: string } | null;

export function SchoolActions({
  schoolId,
  schoolName,
  contactName,
  phone,
  email,
  blocked,
  blockedReason,
}: {
  schoolId: string;
  schoolName: string;
  contactName: string;
  phone: string;
  email: string | null;
  blocked: boolean;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [message, setMessage] = useState("");
  const [messageFeedback, setMessageFeedback] = useState<Feedback>(null);

  const [reason, setReason] = useState(blockedReason ?? "");
  const [blockFeedback, setBlockFeedback] = useState<Feedback>(null);

  const [confirmName, setConfirmName] = useState("");
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback>(null);

  function send() {
    setMessageFeedback(null);
    startTransition(async () => {
      const res = await sendAdminMessageAction(schoolId, message);
      if ("error" in res && res.error) {
        setMessageFeedback({ tone: "error", text: res.error });
        return;
      }
      const simulated = "mode" in res && res.mode === "mock";
      setMessage("");
      setMessageFeedback({
        tone: "ok",
        text: simulated
          ? "Message enregistré. WhatsApp n'étant pas configuré, il n'a pas été réellement expédié."
          : `Message envoyé à ${contactName}.`,
      });
      router.refresh();
    });
  }

  function toggleBlock() {
    const next = !blocked;
    if (next && !confirm(`Bloquer « ${schoolName} » ? L'équipe ne pourra plus utiliser la plateforme.`)) return;
    setBlockFeedback(null);
    startTransition(async () => {
      const res = await setSchoolBlockedAction(schoolId, next, reason);
      if (res && "error" in res && res.error) {
        setBlockFeedback({ tone: "error", text: res.error });
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Supprimer définitivement « ${schoolName} » et toutes ses données ? Action irréversible.`)) return;
    setDeleteFeedback(null);
    startTransition(async () => {
      const res = await deleteSchoolAction(schoolId, confirmName);
      if (res && "error" in res && res.error) {
        setDeleteFeedback({ tone: "error", text: res.error });
        return;
      }
      router.push("/admin");
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <div className="text-[15px] font-semibold">Responsable du compte</div>
        <div className="grid gap-1.5 mt-3 text-[13.5px]">
          <Row label="Nom" value={contactName} />
          <Row label="Téléphone" value={phone} mono />
          <Row label="E-mail" value={email ?? "—"} />
        </div>
      </Card>

      <Card>
        <div className="text-[15px] font-semibold">Envoyer un message</div>
        <div className="text-[12.5px] text-(--color-text-muted) mt-1 leading-relaxed">
          Envoyé sur WhatsApp au {phone}. Utile pour une relance d&apos;abonnement ou une explication de blocage.
        </div>
        <div className="mt-3">
          <Field>
            <Label>Message</Label>
            <Textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              placeholder={`Bonjour ${contactName}, votre période d'essai se termine bientôt…`}
              className="text-[13.5px]"
            />
          </Field>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11.5px] text-(--color-text-muted) tabular-nums">{message.length}/1000</span>
          <Button type="button" onClick={send} disabled={pending || message.trim().length < 2}>
            {pending ? "Envoi…" : "Envoyer"}
          </Button>
        </div>
        {messageFeedback && <Feedback feedback={messageFeedback} />}
      </Card>

      <Card className={blocked ? "border-(--color-success-border)" : "border-(--color-gold-border)"}>
        <div className="text-[15px] font-semibold">{blocked ? "Débloquer le compte" : "Bloquer le compte"}</div>
        <div className="text-[12.5px] text-(--color-text-muted) mt-1 leading-relaxed">
          {blocked
            ? "L'établissement retrouvera immédiatement l'accès à ses données."
            : "L'accès est suspendu sans rien supprimer : classes, élèves et paiements sont conservés."}
        </div>
        {!blocked && (
          <div className="mt-3">
            <Field>
              <Label>Motif (montré à l&apos;établissement)</Label>
              <TextInput
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Abonnement impayé depuis 2 mois"
              />
            </Field>
          </div>
        )}
        <Button
          type="button"
          variant={blocked ? "primary" : "secondary"}
          onClick={toggleBlock}
          disabled={pending}
          className={`w-full mt-3.5 ${blocked ? "" : "text-(--color-danger-text) border-(--color-danger-border)"}`}
        >
          {pending ? "…" : blocked ? "Débloquer l'accès" : "Bloquer l'accès"}
        </Button>
        {blockFeedback && <Feedback feedback={blockFeedback} />}
      </Card>

      <Card className="border-(--color-danger-border)">
        <div className="text-[15px] font-semibold text-(--color-danger-text)">Supprimer l&apos;établissement</div>
        <div className="text-[12.5px] text-(--color-text-muted) mt-1 leading-relaxed">
          Efface le compte, ses classes, ses élèves, ses paiements et ses reçus. Irréversible — préférez le blocage en
          cas de doute.
        </div>
        <div className="mt-3">
          <Field>
            <Label>Tapez « {schoolName} » pour confirmer</Label>
            <TextInput value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={schoolName} />
          </Field>
        </div>
        <Button
          type="button"
          variant="danger"
          onClick={remove}
          disabled={pending || confirmName.trim() !== schoolName.trim()}
          className="w-full mt-3.5"
        >
          {pending ? "Suppression…" : "Supprimer définitivement"}
        </Button>
        {deleteFeedback && <Feedback feedback={deleteFeedback} />}
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-(--color-text-muted)">{label}</span>
      <b className={`text-right ${mono ? "tabular-nums" : ""}`}>{value}</b>
    </div>
  );
}

function Feedback({ feedback }: { feedback: NonNullable<Feedback> }) {
  return (
    <div
      className={`mt-3 text-[12.5px] rounded-lg px-3 py-2 leading-relaxed ${
        feedback.tone === "ok"
          ? "text-(--color-success-text) bg-(--color-success-bg-soft) border border-(--color-success-border)"
          : "text-(--color-danger-text) bg-(--color-danger-bg-soft) border border-(--color-danger-border)"
      }`}
    >
      {feedback.text}
    </div>
  );
}
