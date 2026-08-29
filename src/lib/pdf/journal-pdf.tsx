import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatAmount, formatDate } from "@/lib/format";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 15, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#6A635B", marginBottom: 14 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#DFD8CC", paddingVertical: 5 },
  headerRow: { flexDirection: "row", backgroundColor: "#FBF9F4", paddingVertical: 6, fontWeight: 700 },
  cell: { paddingHorizontal: 3 },
  total: { marginTop: 10, fontSize: 11, fontWeight: 700, textAlign: "right" },
});

export type JournalRow = { receipt: string; date: string; student: string; className: string; objet: string; method: string; amount: number };

function JournalPdf({ rows, schoolName }: { rows: JournalRow[]; schoolName: string }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{schoolName} — Journal de caisse</Text>
        <Text style={styles.subtitle}>{rows.length} paiement(s) · généré le {formatDate(new Date())}</Text>
        <View style={styles.headerRow}>
          <Text style={[styles.cell, { width: "12%" }]}>Reçu</Text>
          <Text style={[styles.cell, { width: "13%" }]}>Date</Text>
          <Text style={[styles.cell, { width: "22%" }]}>Élève</Text>
          <Text style={[styles.cell, { width: "13%" }]}>Classe</Text>
          <Text style={[styles.cell, { width: "20%" }]}>Objet</Text>
          <Text style={[styles.cell, { width: "10%" }]}>Mode</Text>
          <Text style={[styles.cell, { width: "10%" }]}>Montant</Text>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={styles.row}>
            <Text style={[styles.cell, { width: "12%" }]}>{r.receipt}</Text>
            <Text style={[styles.cell, { width: "13%" }]}>{r.date}</Text>
            <Text style={[styles.cell, { width: "22%" }]}>{r.student}</Text>
            <Text style={[styles.cell, { width: "13%" }]}>{r.className}</Text>
            <Text style={[styles.cell, { width: "20%" }]}>{r.objet}</Text>
            <Text style={[styles.cell, { width: "10%" }]}>{r.method}</Text>
            <Text style={[styles.cell, { width: "10%" }]}>{formatAmount(r.amount)}</Text>
          </View>
        ))}
        <Text style={styles.total}>Total : {formatAmount(total)} CFA</Text>
      </Page>
    </Document>
  );
}

export function buildJournalPdf(props: { rows: JournalRow[]; schoolName: string }) {
  return <JournalPdf {...props} />;
}
