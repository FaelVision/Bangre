import { formatCFA, formatDate } from "@/lib/format";

/**
 * The WhatsApp confirmation a parent receives after a payment. Pure, so the
 * device composes exactly the same text for a payment taken without a network
 * — only the receipt number is missing, since the server assigns it at sync.
 */
export function paymentConfirmationMessage(input: {
  amount: number;
  studentFirstName: string;
  studentLastName: string;
  className: string;
  date: Date;
  remainingAfter: number;
  schoolName: string;
  receiptNumber: number | null;
}) {
  const receipt = input.receiptNumber ? `reçu N° ${input.receiptNumber}` : "reçu remis à l'école";
  return `Bonjour, nous confirmons la réception de ${formatCFA(input.amount)} pour la scolarité de ${input.studentFirstName} ${input.studentLastName} (${input.className}) le ${formatDate(input.date)}. Reste à payer : ${formatCFA(input.remainingAfter)}. Merci. — ${input.schoolName}, ${receipt}`;
}
