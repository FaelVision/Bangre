import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatAmount } from "@/lib/format";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 15, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#6A635B", marginBottom: 14 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#DFD8CC", paddingVertical: 5 },
  headerRow: { flexDirection: "row", backgroundColor: "#FBF9F4", paddingVertical: 6, fontWeight: 700 },
  cell: { paddingHorizontal: 3 },
});

const COLS = [
  { key: "student", label: "Élève", width: "18%" },
  { key: "className", label: "Classe", width: "10%" },
  { key: "parentName", label: "Parent", width: "16%" },
  { key: "parentPhone", label: "Numéro", width: "14%" },
  { key: "overdueLabel", label: "Tranches dues", width: "22%" },
  { key: "amount", label: "Montant dû", width: "12%" },
  { key: "whatsapp", label: "Statut", width: "8%" },
] as const;

export type LatePdfRow = {
  student: string;
  className: string;
  parentName: string;
  parentPhone: string;
  overdueLabel: string;
  amount: number;
  whatsapp: string;
};

function LateListPdf({ rows, schoolName, totalDue }: { rows: LatePdfRow[]; schoolName: string; totalDue: number }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} orientation="landscape">
        <Text style={styles.title}>{schoolName} — Retards de paiement</Text>
        <Text style={styles.subtitle}>
          {rows.length} élève(s) · {formatAmount(totalDue)} CFA dus · généré le {new Date().toLocaleDateString("fr-FR")}
        </Text>
        <View style={styles.headerRow}>
          {COLS.map((c) => (
            <Text key={c.key} style={[styles.cell, { width: c.width }]}>
              {c.label}
            </Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={styles.row}>
            <Text style={[styles.cell, { width: COLS[0].width }]}>{r.student}</Text>
            <Text style={[styles.cell, { width: COLS[1].width }]}>{r.className}</Text>
            <Text style={[styles.cell, { width: COLS[2].width }]}>{r.parentName}</Text>
            <Text style={[styles.cell, { width: COLS[3].width }]}>{r.parentPhone}</Text>
            <Text style={[styles.cell, { width: COLS[4].width }]}>{r.overdueLabel}</Text>
            <Text style={[styles.cell, { width: COLS[5].width }]}>{formatAmount(r.amount)}</Text>
            <Text style={[styles.cell, { width: COLS[6].width }]}>{r.whatsapp}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export function buildLateListPdf(props: { rows: LatePdfRow[]; schoolName: string; totalDue: number }) {
  return <LateListPdf {...props} />;
}
