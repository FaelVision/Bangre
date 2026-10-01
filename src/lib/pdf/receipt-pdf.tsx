import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatCFA, formatDate } from "@/lib/format";

const styles = StyleSheet.create({
  page: { padding: 26, fontFamily: "Helvetica" },
  card: { border: "1pt solid #DFD8CC", borderRadius: 6, padding: 20, width: "100%" },
  center: { textAlign: "center" },
  eyebrow: { fontSize: 9, color: "#8A8278", letterSpacing: 1 },
  schoolName: { fontSize: 13, fontWeight: 700, marginTop: 4 },
  meta: { fontSize: 9, color: "#8A8278", marginTop: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#DFD8CC", borderStyle: "dashed", marginVertical: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6, fontSize: 10 },
  label: { color: "#8A8278", flexShrink: 0, marginRight: 10 },
  // A long objet (several tenues…) wraps instead of running off the card.
  value: { fontWeight: 700, flex: 1, textAlign: "right" },
  amountLabel: { fontSize: 10, color: "#8A8278" },
  amountValue: { fontSize: 16, fontWeight: 700 },
  footer: { fontSize: 8.5, color: "#8A8278", marginTop: 18, textAlign: "right" },
});

/**
 * The PDF's built-in Helvetica has no glyph for the narrow no-break space that
 * French number formatting puts between thousands: it printed "14/000 CFA".
 */
function pdfCFA(amount: number) {
  return formatCFA(amount).replace(/[  ]/g, " ");
}

export type ReceiptPdfProps = {
  schoolName: string;
  receiptNumber: number;
  date: Date;
  studentName: string;
  className: string;
  objet: string;
  method: string;
  amount: number;
  /** Null: paid in full by nature (tenues) — no balance line. */
  remaining: number | null;
  receivedBy: string;
  /** "REÇU DE PAIEMENT" unless given — the canteen receipts say what they are for. */
  title?: string;
  /** Label of the balance line; tuition receipts show "Reste dû". */
  remainingLabel?: string;
};

function ReceiptPdf(props: ReceiptPdfProps) {
  return (
    <Document>
      <Page size={[320, 420]} style={styles.page}>
        <View style={styles.card}>
          <View style={[styles.center, { borderBottomWidth: 1, borderBottomColor: "#DFD8CC", borderStyle: "dashed", paddingBottom: 12 }]}>
            <Text style={styles.eyebrow}>{props.title ?? "REÇU DE PAIEMENT"}</Text>
            <Text style={styles.schoolName}>{props.schoolName}</Text>
            <Text style={styles.meta}>
              N° {String(props.receiptNumber).padStart(4, "0")} · {formatDate(props.date)}
            </Text>
          </View>

          <View style={{ marginTop: 12 }}>
            <View style={styles.row}>
              <Text style={styles.label}>Élève</Text>
              <Text style={styles.value}>{props.studentName}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Classe</Text>
              <Text style={styles.value}>{props.className}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Objet</Text>
              <Text style={styles.value}>{props.objet}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Mode</Text>
              <Text style={styles.value}>{props.method}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Reçu par</Text>
              <Text style={styles.value}>{props.receivedBy}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.amountLabel}>Montant</Text>
            <Text style={styles.amountValue}>{pdfCFA(props.amount)}</Text>
          </View>
          {props.remaining != null && (
            <View style={styles.row}>
              <Text style={styles.amountLabel}>{props.remainingLabel ?? "Reste dû"}</Text>
              <Text style={{ fontSize: 11, fontWeight: 700 }}>{pdfCFA(props.remaining)}</Text>
            </View>
          )}

          <Text style={styles.footer}>Cachet & signature ___________</Text>
        </View>
      </Page>
    </Document>
  );
}

export function buildReceiptPdf(props: ReceiptPdfProps) {
  return <ReceiptPdf {...props} />;
}
