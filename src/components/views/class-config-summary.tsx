import Link from "next/link";
import type { ClassWithTranches } from "@/lib/tuition";
import { formatCFA, formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { parseReminderTemplates, REMINDER_SITUATIONS } from "@/lib/reminder-message";

/**
 * A class's configuration as the offline app shows it: everything the
 * secretary may need to answer a parent — amounts, tranches, due dates, the
 * rappel messages — read from the device copy. Changing it waits for the
 * network, since every computer's encaissements depend on these tranches.
 */
export function ClassConfigSummary({ clazz, studentCount }: { clazz: ClassWithTranches; studentCount: number }) {
  const tranches = [...clazz.tranches].sort((a, b) => a.order - b.order);
  const templates = parseReminderTemplates(clazz.reminderMessageTemplate);

  return (
    <div>
      <div className="border-b border-(--color-border) px-4 lg:px-7 py-3.5">
        <div className="text-[12.5px] text-(--color-text-muted)">
          <Link href="/classes" className="text-(--color-primary) font-medium">
            Classes
          </Link>{" "}
          › {clazz.name}
        </div>
        <div className="text-[19px] font-semibold tracking-tight mt-0.5">Configuration de la {clazz.name}</div>
      </div>

      <div className="p-4 lg:p-5.5 lg:px-7 pb-10 grid gap-3.5 max-w-[900px]">
        <div className="rounded-xl border border-(--color-gold-border) bg-(--color-gold-bg) text-(--color-gold-text) text-[12.5px] px-3.5 py-2.5 leading-relaxed">
          Hors ligne : la configuration est consultable. Pour la modifier, reconnectez-vous — les tranches servent aux
          encaissements de tous les postes.
        </div>

        <Card>
          <div className="text-[15px] font-semibold">Scolarité</div>
          <div className="grid gap-2 mt-3 text-[13.5px]">
            <Row label="Niveau" value={clazz.level} />
            <Row label="Élèves" value={String(studentCount)} />
            <Row
              label="Montant de la scolarité"
              value={clazz.tuitionAmount != null ? formatCFA(clazz.tuitionAmount) : "Non défini"}
            />
            <Row label="Frais d'inscription" value={clazz.registrationFee ? formatCFA(clazz.registrationFee) : "—"} />
          </div>
        </Card>

        <Card>
          <div className="text-[15px] font-semibold">Tranches</div>
          {tranches.length === 0 ? (
            <div className="text-[13px] text-(--color-text-muted) mt-2">Aucune tranche définie.</div>
          ) : (
            <div className="grid gap-2 mt-3">
              {tranches.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border border-(--color-border) bg-(--color-bg-subtle) px-3.5 py-2.5 text-[13.5px]"
                >
                  <span className="font-semibold flex-1 min-w-[140px]">{t.label}</span>
                  <span className="text-(--color-text-muted)">Échéance {formatDate(t.dueDate)}</span>
                  <b className="tabular-nums">{formatCFA(t.amount)}</b>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="text-[15px] font-semibold">Messages de rappel</div>
          <div className="grid gap-3.5 mt-3">
            {REMINDER_SITUATIONS.map((situation) => (
              <div key={situation.key}>
                <div className="text-[13px] font-semibold">{situation.title}</div>
                <div className="text-[12.5px] leading-relaxed whitespace-pre-line rounded-[10px] border border-(--color-border) bg-white px-3.5 py-2.5 mt-1 text-(--color-text-secondary)">
                  {templates[situation.key]}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Link
          href={`/classes/${clazz.id}/eleves`}
          className="text-[13px] font-semibold text-(--color-primary)"
        >
          Voir les élèves de la {clazz.name} →
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-(--color-text-muted)">{label}</span>
      <b className="tabular-nums text-right">{value}</b>
    </div>
  );
}
