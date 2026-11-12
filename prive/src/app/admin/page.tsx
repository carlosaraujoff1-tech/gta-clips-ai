"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Building2,
  FileCheck2,
  Flag,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ScrollText,
  ShieldAlert,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";

import { Art, Avatar, Logo } from "@/components/art";
import { AgeGate } from "@/components/age-gate";
import { Guard } from "@/components/guard";
import { Badge, Button, Card, Empty, Input, Notice, cn } from "@/components/ui";
import {
  AppError,
  hasPermission,
  reviewVerification,
  setEstablishmentStatus,
  setPhotoStatus,
  setProfessionalStatus,
  setReportStatus,
  setUserStatus,
  signOut,
  togglePermission,
  userName,
} from "@/lib/db";
import { relative } from "@/lib/format";
import { ageFrom } from "@/lib/safety";
import type { AdminPermission, DB, User } from "@/lib/types";

const SECTIONS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "verificacoes", label: "Verificações", icon: FileCheck2 },
  { id: "denuncias", label: "Denúncias", icon: Flag },
  { id: "moderacao", label: "Moderação", icon: ImageIcon },
  { id: "usuarios", label: "Usuários", icon: Users },
  { id: "perfis", label: "Perfis", icon: Sparkles },
  { id: "estabelecimentos", label: "Estabelecimentos", icon: Building2 },
  { id: "relatorios", label: "Relatórios", icon: BarChart3 },
  { id: "auditoria", label: "Auditoria", icon: ScrollText },
  { id: "permissoes", label: "Permissões", icon: KeyRound },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

const PERMS: { id: AdminPermission; label: string }[] = [
  { id: "verifications.review", label: "Revisar verificações" },
  { id: "reports.moderate", label: "Moderar denúncias e conteúdo" },
  { id: "users.manage", label: "Gerenciar usuários" },
  { id: "establishments.manage", label: "Gerenciar estabelecimentos" },
  { id: "reports.view", label: "Ver relatórios" },
  { id: "permissions.manage", label: "Gerenciar permissões" },
];

export default function AdminPage() {
  return (
    <AgeGate>
      <Guard roles={["admin"]}>{(s) => <Admin db={s.db} me={s.me} />}</Guard>
    </AgeGate>
  );
}

function Admin({ db, me }: { db: DB; me: User }) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("dashboard");
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => void) => {
    setError(null);
    try {
      fn();
    } catch (e) {
      setError(e instanceof AppError ? e.message : "Erro inesperado");
    }
  };
  const counts: Partial<Record<Section, number>> = {
    verificacoes: db.verifications.filter((v) => v.status === "pending").length,
    denuncias: db.reports.filter((r) => r.status === "open" || r.status === "reviewing").length,
    moderacao: db.professionals.reduce((n, p) => n + p.photos.filter((ph) => ph.status === "pending").length, 0),
    estabelecimentos: db.establishments.filter((e) => e.status === "pending").length,
  };
  const props = { db, me, run };

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="safe-top border-b border-line bg-night lg:fixed lg:inset-y-0 lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-5 py-4 lg:py-7">
          <div>
            <Logo className="text-2xl" />
            <p className="text-[10px] tracking-[0.3em] text-ink-3 uppercase">Administração</p>
          </div>
          <div className="flex gap-1 lg:hidden">
            <Link href="/conta" aria-label="Conta" className="grid size-10 place-items-center rounded-full text-ink-3 hover:bg-card-2">
              <UserRound className="size-4" />
            </Link>
          </div>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm whitespace-nowrap transition",
                section === s.id ? "bg-gold/12 text-gold-2" : "text-ink-2 hover:bg-card-2 hover:text-ink",
              )}
            >
              <s.icon className="size-4" strokeWidth={1.6} />
              {s.label}
              {!!counts[s.id] && <span className="ml-auto rounded-full bg-gold px-1.5 text-[10px] font-semibold text-void">{counts[s.id]}</span>}
            </button>
          ))}
        </nav>
        <div className="hidden px-6 pt-6 lg:block">
          <p className="text-sm">{me.name}</p>
          <p className="text-xs text-ink-3">{me.email}</p>
          <button
            onClick={() => {
              signOut();
              router.replace("/entrar");
            }}
            className="mt-3 flex items-center gap-2 text-xs text-ink-3 hover:text-ink"
          >
            <LogOut className="size-3.5" /> Sair
          </button>
        </div>
      </aside>

      <main className="w-full px-5 py-6 lg:ml-64 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-5xl">
          <h1 className="font-display mb-6 text-3xl">{SECTIONS.find((s) => s.id === section)!.label}</h1>
          {error && (
            <div className="mb-4">
              <Notice tone="bad">{error}</Notice>
            </div>
          )}
          {section === "dashboard" && <Dashboard db={db} go={setSection} />}
          {section === "verificacoes" && <Verifications {...props} />}
          {section === "denuncias" && <Reports {...props} />}
          {section === "moderacao" && <Moderation {...props} />}
          {section === "usuarios" && <UsersList {...props} />}
          {section === "perfis" && <Profiles {...props} />}
          {section === "estabelecimentos" && <Establishments {...props} />}
          {section === "relatorios" && <Analytics db={db} me={me} />}
          {section === "auditoria" && <Audit db={db} />}
          {section === "permissoes" && <Permissions {...props} />}
        </div>
      </main>
    </div>
  );
}

type P = { db: DB; me: User; run: (fn: () => void) => void };

function Kpi({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: "bad" }) {
  return (
    <Card className="p-5">
      <p className="text-[11px] tracking-[0.18em] text-ink-3 uppercase">{label}</p>
      <p className={cn("font-display mt-2 text-3xl leading-none", tone === "bad" && "text-bad")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </Card>
  );
}

function Dashboard({ db, go }: { db: DB; go: (s: Section) => void }) {
  const urgent = db.reports.filter((r) => r.priority === "urgent" && r.status !== "resolved" && r.status !== "dismissed");
  return (
    <div className="space-y-6">
      {urgent.length > 0 && (
        <button onClick={() => go("denuncias")} className="w-full text-left">
          <Notice tone="bad">
            <span className="flex items-center gap-2">
              <ShieldAlert className="size-4" /> {urgent.length} denúncia(s) URGENTE(S) envolvendo possível menor de idade ou exploração. Tratar imediatamente.
            </span>
          </Notice>
        </button>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Usuários" value={db.users.length} hint={`${db.users.filter((u) => u.role === "client").length} clientes`} />
        <Kpi label="Perfis publicados" value={db.professionals.filter((p) => p.status === "published").length} hint={`${db.professionals.length} no total`} />
        <Kpi label="Verificações" value={db.verifications.filter((v) => v.status === "pending").length} hint="pendentes" />
        <Kpi label="Denúncias abertas" value={db.reports.filter((r) => r.status === "open" || r.status === "reviewing").length} tone={urgent.length ? "bad" : undefined} />
        <Kpi label="Solicitações" value={db.bookings.length} hint={`${db.bookings.filter((b) => b.status === "requested").length} aguardando`} />
        <Kpi label="Confirmadas" value={db.bookings.filter((b) => b.status === "accepted").length} />
        <Kpi label="Estabelecimentos" value={db.establishments.filter((e) => e.status === "approved").length} hint={`${db.establishments.filter((e) => e.status === "pending").length} em análise`} />
        <Kpi label="Avaliações" value={db.reviews.length} />
      </div>
      <Card className="p-5">
        <p className="mb-3 text-[11px] tracking-[0.18em] text-ink-3 uppercase">Atividade administrativa recente</p>
        <AuditList db={db} limit={6} />
      </Card>
    </div>
  );
}

function Verifications({ db, run }: P) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const list = db.verifications.filter((v) => v.status === "pending");
  const done = db.verifications.filter((v) => v.status !== "pending").slice(0, 10);
  return (
    <div className="space-y-4">
      {list.length === 0 && <Empty icon={<FileCheck2 className="size-5" />} title="Nenhuma verificação pendente" />}
      {list.map((v) => {
        const p = db.professionals.find((x) => x.id === v.professionalId);
        const age = ageFrom(v.birthdate);
        return (
          <Card key={v.id} className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar hue={p?.hue ?? 0} name={p?.displayName ?? "?"} />
              <div className="flex-1">
                <p className="text-[15px]">
                  {p?.displayName} <span className="text-ink-3">· {v.legalName}</span>
                </p>
                <p className="text-xs text-ink-3">
                  {v.documentType} · enviado {relative(v.createdAt)}
                </p>
              </div>
              <Badge tone={age >= 18 ? "ok" : "bad"}>{age} anos</Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[v.documentFile, v.selfieFile].map((f, i) => (
                <div key={f} className="rounded-2xl border border-line bg-night p-3 text-xs text-ink-3">
                  <FileCheck2 className="mb-2 size-5 text-gold" />
                  {i === 0 ? "Documento" : "Selfie"}
                  <span className="block truncate text-ink-2">{f}</span>
                  <span className="mt-1 block text-[10px]">URL assinada · expira em 5 min</span>
                </div>
              ))}
              {p?.photos.slice(0, 2).map((ph) => <Art key={ph.id} hue={ph.hue} label={p.displayName} className="aspect-square rounded-2xl" />)}
            </div>
            <ul className="mt-4 space-y-1 text-xs text-ink-3">
              <li>☐ Foto do documento confere com a selfie e com as fotos do perfil</li>
              <li>☐ Data de nascimento confere com o documento (maioridade)</li>
              <li>☐ Sem sinais de coerção, terceiros na imagem ou documento adulterado</li>
            </ul>
            <Input placeholder="Observações (enviadas ao perfil em caso de recusa)" value={notes[v.id] ?? ""} onChange={(e) => setNotes({ ...notes, [v.id]: e.target.value })} className="mt-4 h-10 text-sm" />
            <div className="mt-3 flex gap-2">
              <Button variant="danger" className="h-10 flex-1" onClick={() => run(() => reviewVerification(v.id, false, notes[v.id] ?? ""))}>
                Recusar
              </Button>
              <Button className="h-10 flex-1" disabled={age < 18} onClick={() => run(() => reviewVerification(v.id, true, notes[v.id] ?? ""))}>
                Aprovar e publicar
              </Button>
            </div>
          </Card>
        );
      })}
      {done.length > 0 && (
        <Card className="p-5">
          <p className="mb-3 text-[11px] tracking-[0.18em] text-ink-3 uppercase">Histórico</p>
          {done.map((v) => (
            <p key={v.id} className="flex justify-between border-b border-line py-2 text-sm last:border-0">
              {v.legalName} <Badge tone={v.status === "approved" ? "ok" : "bad"}>{v.status === "approved" ? "Aprovada" : "Recusada"}</Badge>
            </p>
          ))}
        </Card>
      )}
    </div>
  );
}

function targetLabel(db: DB, type: string, id: string) {
  if (type === "professional") return db.professionals.find((p) => p.id === id)?.displayName ?? "Perfil removido";
  if (type === "establishment") return db.establishments.find((e) => e.id === id)?.name ?? "Estabelecimento removido";
  if (type === "message") return `“${db.messages.find((m) => m.id === id)?.text ?? "mensagem"}”`;
  return userName(db, id);
}

function Reports({ db, run }: P) {
  const [show, setShow] = useState<"open" | "closed">("open");
  const list = db.reports
    .filter((r) => (show === "open" ? r.status === "open" || r.status === "reviewing" : r.status === "resolved" || r.status === "dismissed"))
    .sort((a, b) => (a.priority === b.priority ? b.createdAt.localeCompare(a.createdAt) : a.priority === "urgent" ? -1 : 1));
  return (
    <>
      <div className="mb-4 flex gap-2">
        {(["open", "closed"] as const).map((k) => (
          <button key={k} onClick={() => setShow(k)} className={cn("rounded-full border px-4 py-1.5 text-sm", show === k ? "border-gold text-gold-2" : "border-line text-ink-3")}>
            {k === "open" ? "Em aberto" : "Encerradas"}
          </button>
        ))}
      </div>
      <Notice tone="mute">
        Casos com indício de menor de idade ou tráfico de pessoas: suspender o perfil, preservar as evidências e comunicar às autoridades (Disque 100 / Polícia Federal / SaferNet) conforme o protocolo interno.
      </Notice>
      <div className="mt-4 space-y-3">
        {list.length === 0 && <Empty icon={<Flag className="size-5" />} title="Nenhuma denúncia" />}
        {list.map((r) => {
          const pro = r.targetType === "professional" ? db.professionals.find((p) => p.id === r.targetId) : undefined;
          return (
            <Card key={r.id} className={cn("p-5", r.priority === "urgent" && "border-bad/40")}>
              <div className="flex flex-wrap items-center gap-2">
                {r.priority === "urgent" && (
                  <Badge tone="bad">
                    <ShieldAlert className="size-3" /> Urgente
                  </Badge>
                )}
                {r.automatic && <Badge>Automática</Badge>}
                <Badge tone={r.status === "open" ? "warn" : "mute"}>{{ open: "Aberta", reviewing: "Em análise", resolved: "Resolvida", dismissed: "Arquivada" }[r.status]}</Badge>
                <span className="ml-auto text-xs text-ink-3">{relative(r.createdAt)}</span>
              </div>
              <p className="mt-3 text-[15px]">{r.reason}</p>
              <p className="text-sm text-ink-3">
                Alvo ({r.targetType}): <span className="text-ink-2">{targetLabel(db, r.targetType, r.targetId)}</span> · por {userName(db, r.reporterId)}
              </p>
              {r.details && <p className="mt-2 text-sm text-ink-2">{r.details}</p>}
              {(r.status === "open" || r.status === "reviewing") && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {r.status === "open" && (
                    <Button variant="outline" className="h-9 text-xs" onClick={() => run(() => setReportStatus(r.id, "reviewing"))}>
                      Assumir análise
                    </Button>
                  )}
                  {pro && pro.status === "published" && (
                    <Button variant="danger" className="h-9 text-xs" onClick={() => run(() => setProfessionalStatus(pro.id, "suspended", `Denúncia: ${r.reason}`))}>
                      Suspender perfil
                    </Button>
                  )}
                  <Button variant="ghost" className="h-9 text-xs" onClick={() => run(() => setReportStatus(r.id, "dismissed"))}>
                    Arquivar
                  </Button>
                  <Button className="h-9 text-xs" onClick={() => run(() => setReportStatus(r.id, "resolved"))}>
                    Resolver
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Moderation({ db, run }: P) {
  const items = db.professionals.flatMap((p) => p.photos.filter((ph) => ph.status === "pending").map((ph) => ({ p, ph })));
  const flagged = db.messages.filter((m) => m.flagged);
  return (
    <div className="space-y-6">
      <section>
        <p className="mb-3 text-[11px] tracking-[0.18em] text-ink-3 uppercase">Fotos aguardando aprovação · {items.length}</p>
        {items.length === 0 ? (
          <p className="text-sm text-ink-3">Nenhuma foto pendente.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map(({ p, ph }) => (
              <Card key={ph.id} className="overflow-hidden">
                <Art hue={ph.hue} label={p.displayName} className="aspect-[3/4] rounded-none" />
                <div className="p-3">
                  <p className="text-sm">{p.displayName}</p>
                  <p className="text-xs text-ink-3">{ph.caption}</p>
                  <div className="mt-2 flex gap-1.5">
                    <Button variant="danger" className="h-8 flex-1 px-2 text-xs" onClick={() => run(() => setPhotoStatus(p.id, ph.id, "rejected"))}>
                      Recusar
                    </Button>
                    <Button className="h-8 flex-1 px-2 text-xs" onClick={() => run(() => setPhotoStatus(p.id, ph.id, "approved"))}>
                      Aprovar
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section>
        <p className="mb-3 text-[11px] tracking-[0.18em] text-ink-3 uppercase">Mensagens sinalizadas automaticamente · {flagged.length}</p>
        {flagged.length === 0 ? (
          <p className="text-sm text-ink-3">Nenhuma mensagem sinalizada.</p>
        ) : (
          flagged.map((m) => (
            <Card key={m.id} className="mb-2 p-4 text-sm">
              <p className="text-ink-2">“{m.text}”</p>
              <p className="mt-1 text-xs text-ink-3">
                {userName(db, m.senderId)} · {relative(m.createdAt)}
              </p>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}

function UsersList({ db, me, run }: P) {
  const [q, setQ] = useState("");
  const list = db.users.filter((u) => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q.toLowerCase()));
  const roleLabel = { client: "Cliente", professional: "Profissional", partner: "Parceiro", admin: "Admin" };
  return (
    <>
      <Input placeholder="Buscar por nome, e-mail ou função" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4" />
      <Card className="divide-y divide-line">
        {list.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar hue={u.hue} name={u.name} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{u.name}</p>
              <p className="truncate text-xs text-ink-3">{u.email}</p>
            </div>
            <Badge>{roleLabel[u.role]}</Badge>
            <Badge tone={u.status === "active" ? "ok" : "bad"}>{u.status === "active" ? "Ativo" : "Suspenso"}</Badge>
            {u.id !== me.id && (
              <Button
                variant={u.status === "active" ? "danger" : "outline"}
                className="h-8 px-3 text-xs"
                onClick={() => run(() => setUserStatus(u.id, u.status === "active" ? "suspended" : "active", "Ação manual"))}
              >
                {u.status === "active" ? "Suspender" : "Reativar"}
              </Button>
            )}
          </div>
        ))}
      </Card>
    </>
  );
}

function Profiles({ db, run }: P) {
  const tone = { published: "ok", pending: "warn", draft: "mute", suspended: "bad" } as const;
  const label = { published: "Publicado", pending: "Em análise", draft: "Rascunho", suspended: "Suspenso" };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {db.professionals.map((p) => (
        <Card key={p.id} className="flex items-center gap-3 p-4">
          <Avatar hue={p.hue} name={p.displayName} />
          <div className="min-w-0 flex-1">
            <p className="text-sm">{p.displayName}</p>
            <p className="truncate text-xs text-ink-3">
              {p.region}, {p.city} · {p.verification === "verified" ? "verificado" : p.verification}
            </p>
          </div>
          <Badge tone={tone[p.status]}>{label[p.status]}</Badge>
          {p.status === "published" && (
            <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => run(() => setProfessionalStatus(p.id, "suspended", "Moderação manual"))}>
              Suspender
            </Button>
          )}
          {p.status === "suspended" && (
            <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => run(() => setProfessionalStatus(p.id, "published", "Reativado"))}>
              Reativar
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}

function Establishments({ db, run }: P) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {db.establishments.map((e) => (
        <Card key={e.id} className="overflow-hidden">
          <Art hue={e.hue} label={e.name} className="aspect-[16/7] rounded-none" />
          <div className="p-4">
            <div className="flex items-center justify-between">
              <p className="font-display text-xl">{e.name}</p>
              <Badge tone={e.status === "approved" ? "ok" : e.status === "pending" ? "warn" : "bad"}>{{ approved: "Aprovado", pending: "Em análise", suspended: "Suspenso" }[e.status]}</Badge>
            </div>
            <p className="text-xs text-ink-3">
              {e.kind} · {e.address}
            </p>
            <p className="mt-1 text-xs text-ink-3">
              Alvará: <span className="text-ink-2">{e.licenseNumber}</span> · Responsável: {userName(db, e.ownerId)}
            </p>
            <div className="mt-3 flex gap-2">
              {e.status !== "approved" && (
                <Button className="h-9 flex-1 text-xs" onClick={() => run(() => setEstablishmentStatus(e.id, "approved", "Alvará conferido"))}>
                  Aprovar
                </Button>
              )}
              {e.status !== "suspended" && (
                <Button variant="danger" className="h-9 flex-1 text-xs" onClick={() => run(() => setEstablishmentStatus(e.id, "suspended", "Ação manual"))}>
                  Suspender
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Analytics({ db, me }: { db: DB; me: User }) {
  if (!hasPermission(db, me.id, "reports.view")) return <Notice tone="bad">Você não tem permissão para ver relatórios.</Notice>;
  const byCity = Object.entries(
    db.professionals.filter((p) => p.status === "published").reduce<Record<string, number>>((acc, p) => ((acc[p.city] = (acc[p.city] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1]);
  const statuses = ["requested", "accepted", "completed", "declined", "cancelled"] as const;
  const stLabel = { requested: "Aguardando", accepted: "Confirmadas", completed: "Concluídas", declined: "Recusadas", cancelled: "Canceladas" };
  const max = Math.max(1, ...statuses.map((s) => db.bookings.filter((b) => b.status === s).length));
  const reasons = Object.entries(db.reports.reduce<Record<string, number>>((acc, r) => ((acc[r.reason] = (acc[r.reason] ?? 0) + 1), acc), {}));
  const csv = () => {
    const rows = [["id", "status", "data", "hora", "perfil/estabelecimento"], ...db.bookings.map((b) => [b.id, b.status, b.date, b.time, b.professionalId ?? b.establishmentId ?? ""])];
    const blob = new Blob([rows.map((r) => r.join(";")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "prive-reservas.csv";
    a.click();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <p className="mb-4 text-[11px] tracking-[0.18em] text-ink-3 uppercase">Solicitações por status</p>
        {statuses.map((s) => {
          const n = db.bookings.filter((b) => b.status === s).length;
          return (
            <div key={s} className="mb-3">
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-ink-2">{stLabel[s]}</span>
                <span>{n}</span>
              </div>
              <div className="h-2 rounded-full bg-card-2">
                <div className="h-2 rounded-full bg-gradient-to-r from-gold-3 to-gold-2" style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </Card>
      <Card className="p-5">
        <p className="mb-4 text-[11px] tracking-[0.18em] text-ink-3 uppercase">Perfis publicados por cidade</p>
        {byCity.map(([c, n]) => (
          <p key={c} className="flex justify-between border-b border-line py-2 text-sm last:border-0">
            <span className="text-ink-2">{c}</span> {n}
          </p>
        ))}
      </Card>
      <Card className="p-5 lg:col-span-2">
        <p className="mb-4 text-[11px] tracking-[0.18em] text-ink-3 uppercase">Denúncias por motivo</p>
        {reasons.map(([r, n]) => (
          <p key={r} className="flex justify-between border-b border-line py-2 text-sm last:border-0">
            <span className="text-ink-2">{r}</span> {n}
          </p>
        ))}
        <Button variant="outline" className="mt-4 h-10" onClick={csv}>
          Exportar reservas (CSV, sem dados pessoais)
        </Button>
      </Card>
    </div>
  );
}

function AuditList({ db, limit }: { db: DB; limit?: number }) {
  const list = limit ? db.audit.slice(0, limit) : db.audit;
  if (!list.length) return <p className="text-sm text-ink-3">Sem registros.</p>;
  return (
    <ul className="divide-y divide-line">
      {list.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
          <code className="rounded bg-card-2 px-1.5 py-0.5 text-[11px] text-gold-2">{a.action}</code>
          <span className="text-ink-2">{userName(db, a.actorId)}</span>
          <span className="text-ink-3">
            → {a.targetType}:{a.targetId.slice(0, 8)}
          </span>
          {a.details && <span className="text-xs text-ink-3">“{a.details}”</span>}
          <span className="ml-auto text-xs text-ink-3">{relative(a.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function Audit({ db }: { db: DB }) {
  return (
    <Card className="p-5">
      <p className="mb-3 text-xs text-ink-3">Registro imutável (somente inserção) de toda ação administrativa. No Supabase, a tabela não aceita UPDATE nem DELETE.</p>
      <AuditList db={db} />
    </Card>
  );
}

function Permissions({ db, run }: P) {
  const admins = db.users.filter((u) => u.role === "admin");
  return (
    <div className="space-y-4">
      {admins.map((a) => (
        <Card key={a.id} className="p-5">
          <div className="mb-3 flex items-center gap-3">
            <Avatar hue={a.hue} name={a.name} size={36} />
            <div>
              <p className="text-sm">{a.name}</p>
              <p className="text-xs text-ink-3">{a.email}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERMS.map((perm) => {
              const on = hasPermission(db, a.id, perm.id);
              return (
                <button
                  key={perm.id}
                  onClick={() => run(() => togglePermission(a.id, perm.id))}
                  className={cn("flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition", on ? "border-gold/40 text-ink" : "border-line text-ink-3")}
                >
                  {perm.label}
                  <span className={cn("size-2.5 rounded-full", on ? "bg-gold" : "bg-line-2")} />
                </button>
              );
            })}
          </div>
        </Card>
      ))}
      <p className="text-xs text-ink-3">Funções disponíveis: cliente, profissional, parceiro e administrador. Administradores recebem permissões granulares (princípio do menor privilégio).</p>
    </div>
  );
}
