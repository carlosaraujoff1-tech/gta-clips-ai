import { Badge } from "./ui";
import type { BookingStatus } from "@/lib/types";

const MAP: Record<BookingStatus, { label: string; tone: "gold" | "ok" | "warn" | "bad" | "mute" }> = {
  requested: { label: "Aguardando confirmação", tone: "warn" },
  accepted: { label: "Confirmada", tone: "ok" },
  declined: { label: "Recusada", tone: "bad" },
  cancelled: { label: "Cancelada", tone: "mute" },
  completed: { label: "Concluída", tone: "gold" },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={MAP[status].tone}>{MAP[status].label}</Badge>;
}
