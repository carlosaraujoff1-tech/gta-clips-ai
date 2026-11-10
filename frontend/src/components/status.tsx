import { CircleCheck, CircleDashed, CircleX, TriangleAlert } from "lucide-react";

import { Badge, type Tone } from "@/components/ui";
import type {
  ClipStatus,
  Platform,
  PublicationStatus,
  RecordingStatus,
  ServiceState,
} from "@/lib/types";

const SERVICE: Record<ServiceState, { tone: Tone; label: string }> = {
  ok: { tone: "ok", label: "OK" },
  warning: { tone: "warn", label: "Atenção" },
  missing: { tone: "bad", label: "Não encontrado" },
  error: { tone: "bad", label: "Erro" },
  not_implemented: { tone: "violet", label: "Fase futura" },
};

export function ServiceStateBadge({ state }: { state: ServiceState }) {
  const { tone, label } = SERVICE[state];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ServiceStateIcon({ state }: { state: ServiceState }) {
  const cls = "size-4 shrink-0";
  switch (state) {
    case "ok":
      return <CircleCheck className={`${cls} text-ok`} aria-hidden />;
    case "warning":
      return <TriangleAlert className={`${cls} text-warn`} aria-hidden />;
    case "not_implemented":
      return <CircleDashed className={`${cls} text-violet-soft`} aria-hidden />;
    default:
      return <CircleX className={`${cls} text-bad`} aria-hidden />;
  }
}

const RECORDING: Record<RecordingStatus, { tone: Tone; label: string }> = {
  imported: { tone: "neutral", label: "Importada" },
  transcribing: { tone: "accent", label: "Transcrevendo" },
  transcribed: { tone: "accent", label: "Transcrita" },
  analyzing: { tone: "violet", label: "Analisando" },
  analyzed: { tone: "ok", label: "Analisada" },
  failed: { tone: "bad", label: "Falhou" },
};

export function RecordingStatusBadge({ status }: { status: RecordingStatus }) {
  const { tone, label } = RECORDING[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export const CLIP_STATUS_LABEL: Record<ClipStatus, string> = {
  draft: "Sugerido",
  rendering: "Renderizando",
  pending_review: "Aguardando aprovação",
  approved: "Aprovado",
  rejected: "Rejeitado",
  failed: "Falhou",
};

const CLIP_TONE: Record<ClipStatus, Tone> = {
  draft: "neutral",
  rendering: "accent",
  pending_review: "warn",
  approved: "ok",
  rejected: "bad",
  failed: "bad",
};

export function ClipStatusBadge({ status }: { status: ClipStatus }) {
  return <Badge tone={CLIP_TONE[status]}>{CLIP_STATUS_LABEL[status]}</Badge>;
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  instagram_reels: "Instagram Reels",
  manual_export: "Exportação manual",
};

const PUBLICATION: Record<PublicationStatus, { tone: Tone; label: string }> = {
  scheduled: { tone: "accent", label: "Agendada" },
  published: { tone: "ok", label: "Publicada" },
  exported: { tone: "neutral", label: "Exportada" },
  failed: { tone: "bad", label: "Falhou" },
};

export function PublicationStatusBadge({ status }: { status: PublicationStatus }) {
  const { tone, label } = PUBLICATION[status];
  return <Badge tone={tone}>{label}</Badge>;
}
