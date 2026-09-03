import { Badge } from "@/components/ui";
import type { SubscriptionState } from "@/lib/admin-queries";

const STATES: Record<SubscriptionState, { label: string; tone: "success" | "gold" | "danger" | "neutral" }> = {
  active: { label: "Abonné", tone: "success" },
  trial: { label: "Essai", tone: "gold" },
  expired: { label: "Expiré", tone: "neutral" },
  blocked: { label: "Bloqué", tone: "danger" },
};

export function StateBadge({ state }: { state: SubscriptionState }) {
  const { label, tone } = STATES[state];
  return <Badge tone={tone}>{label}</Badge>;
}
