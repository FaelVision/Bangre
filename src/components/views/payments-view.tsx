import Link from "next/link";
import { formatAmount, formatDate } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PayButton } from "@/components/pay-button";

export type PaymentsViewData = {
  total: number;
  totalAmount: number;
  todayAmount: number;
  todayCount: number;
  weekAmount: number;
  weekCount: number;
  offlineCount: number;
  page: number;
  pageCount: number;
  payments: {
    id: string;
    studentId: string;
    receiptNumber: number;
    date: Date;
    amount: number;
    synced: boolean;
    student: { lastName: string; firstName: string; class: { name: string } };
    allocations: { tranche: { label: string } }[];
  }[];
};

/**
 * Paiements & reçus. Offline the journal and the receipt PDFs are out of reach
 * (the server renders them), and a payment taken at the counter shows up here
 * right away as « Hors ligne », numbered once it reaches the server.
 */
export function PaymentsView({ data, offline = false }: { data: PaymentsViewData; offline?: boolean }) {
  return (
    <div>
      <PageHeader
        title="Paiements & reçus"
        subtitle={`${data.total} paiements · ${formatAmount(data.totalAmount)} CFA encaissés`}
        actions={
          <>
            {!offline && (
              <a
                href="/api/paiements/journal-pdf"
                target="_blank"
                className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
              >
                Journal de caisse (PDF)
              </a>
            )}
            <PayButton className="h-[38px] rounded-[9px] bg-(--color-primary) text-white flex items-center px-4 text-[13.5px] font-semibold hover:bg-(--color-primary-hover)">
              + Enregistrer un paiement
            </PayButton>
          </>
        }
      />

      <div className="p-4 lg:p-5 lg:px-7 pb-10 grid gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Card>
            <div className="text-[12.5px] text-(--color-text-muted)">Encaissé aujourd&apos;hui</div>
            <div className="text-[24px] font-bold mt-1.5 tabular-nums whitespace-nowrap">
              {formatAmount(data.todayAmount)}
            </div>
            <div className="text-[12.5px] text-(--color-text-muted)">CFA · {data.todayCount} reçus</div>
          </Card>
          <Card>
            <div className="text-[12.5px] text-(--color-text-muted)">Cette semaine</div>
            <div className="text-[24px] font-bold mt-1.5 tabular-nums whitespace-nowrap">
              {formatAmount(data.weekAmount)}
            </div>
            <div className="text-[12.5px] text-(--color-text-muted)">CFA · {data.weekCount} reçus</div>
          </Card>
          <Card className="border-(--color-gold-border)">
            <div className="text-[12.5px] text-(--color-text-muted)">Reçus à synchroniser</div>
            <div className="text-[24px] font-bold mt-1.5 tabular-nums whitespace-nowrap text-(--color-gold-text-dark)">
              {data.offlineCount}
            </div>
            <div className="text-[12.5px] text-(--color-text-muted)">créés hors ligne</div>
          </Card>
        </div>

        <div className="bg-white border border-(--color-border) rounded-2xl overflow-x-auto">
          <table className="w-full" style={{ minWidth: 1080 }}>
            <thead>
              <tr className="bg-(--color-bg-subtle)">
                <Th>Reçu</Th>
                <Th>Date</Th>
                <Th>Élève</Th>
                <Th>Classe</Th>
                <Th>Objet</Th>
                <Th align="right">Montant</Th>
                <Th>État</Th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id} className="border-t border-(--color-border-row)">
                  <Td className="font-semibold tabular-nums">
                    {p.receiptNumber > 0 ? `N° ${String(p.receiptNumber).padStart(4, "0")}` : "—"}
                  </Td>
                  <Td className="tabular-nums">{formatDate(p.date)}</Td>
                  <Td>
                    <Link href={`/eleves/${p.studentId}`} className="text-(--color-text) no-underline hover:underline">
                      {p.student.lastName} {p.student.firstName}
                    </Link>
                  </Td>
                  <Td>{p.student.class.name}</Td>
                  <Td>{p.allocations.map((a) => a.tranche.label).join(", ") || "—"}</Td>
                  <Td align="right" className="font-semibold tabular-nums">
                    {formatAmount(p.amount)}
                  </Td>
                  <td className="py-3 px-3">
                    <Badge tone={p.synced ? "success" : "gold"}>{p.synced ? "Synchronisé" : "Hors ligne"}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {!offline && p.receiptNumber > 0 && (
                      <a
                        href={`/api/receipts/${p.id}/pdf`}
                        target="_blank"
                        className="text-[12.5px] text-(--color-primary) font-semibold"
                      >
                        PDF
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {data.payments.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-(--color-text-muted) py-8 text-sm">
                    Aucun paiement enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data.pageCount > 1 && (
          <div className="flex gap-1.5 justify-end">
            {Array.from({ length: data.pageCount }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={`/paiements?page=${p}`}
                className={`w-[30px] h-[30px] rounded-lg border flex items-center justify-center text-[12.5px] no-underline hover:no-underline ${
                  p === data.page
                    ? "bg-[#221E1A] text-white border-[#221E1A]"
                    : "border-(--color-border-strong) bg-white text-(--color-text)"
                }`}
              >
                {p}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="text-[11.5px] uppercase tracking-wider text-(--color-text-muted) py-3 px-3 font-semibold first:pl-4"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={`py-3 px-3 text-[13.5px] first:pl-4 ${className}`} style={{ textAlign: align }}>
      {children}
    </td>
  );
}
