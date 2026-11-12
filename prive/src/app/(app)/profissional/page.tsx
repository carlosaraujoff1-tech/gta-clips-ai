"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CalendarCheck2, Camera, CheckCircle2, Clock, Eye, FileCheck2, ImagePlus, Inbox, Plus, ShieldCheck, Trash2, UserRound, X } from "lucide-react";

import { Art, Avatar } from "@/components/art";
import { useSession } from "@/components/guard";
import { Requests, WeeklyEditor } from "@/components/owner";
import { Badge, Button, Card, Chip, Empty, Field, Input, Notice, Select, Spinner, Textarea, TopBar, cn } from "@/components/ui";
import { CATEGORIES, CITIES, FEATURES, KINDS, SERVICE_LOCATIONS, TAGS } from "@/lib/config";
import { AppError, addPhoto, isPremium, bookingsForOwner, myProfessional, ratingOf, removePhoto, submitVerification, updateMyProfessional } from "@/lib/db";
import { isoDate } from "@/lib/format";
import type { DB, Professional, User, WeeklySlot } from "@/lib/types";

const TABS = [
  { id: "geral", label: "Visão geral" },
  { id: "solicitacoes", label: "Solicitações" },
  { id: "agenda", label: "Disponibilidade" },
  { id: "perfil", label: "Perfil & fotos" },
  { id: "verificacao", label: "Verificação" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function ProfessionalPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const s = useSession(["professional"]);
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as Tab) || "geral";
  if (!s) return <Spinner />;
  const p = myProfessional(s.db, s.me);
  if (!p) return <Empty icon={<UserRound className="size-5" />} title="Perfil não encontrado" />;
  const go = (t: Tab) => router.replace(`/profissional?tab=${t}`, { scroll: false });

  return (
    <>
      <TopBar title="Painel profissional" />
      <div className="no-scrollbar -mx-5 mb-5 flex gap-2 overflow-x-auto px-5">
        {TABS.map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => go(t.id)}>
            {t.label}
          </Chip>
        ))}
      </div>
      {tab === "geral" && <Overview db={s.db} me={s.me} p={p} go={go} />}
      {tab === "solicitacoes" && <Requests db={s.db} me={s.me} />}
      {tab === "agenda" && <Availability p={p} />}
      {tab === "perfil" && <ProfileEditor p={p} />}
      {tab === "verificacao" && <VerificationForm db={s.db} p={p} />}
    </>
  );
}

function StatusBanner({ p, go }: { p: Professional; go: (t: Tab) => void }) {
  if (p.status === "published")
    return (
      <Notice>
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-gold" /> Perfil verificado e publicado.
        </span>
      </Notice>
    );
  if (p.status === "pending") return <Notice>Documentos em análise. Normalmente concluímos em até 24h.</Notice>;
  if (p.status === "suspended") return <Notice tone="bad">Perfil suspenso pela moderação. Fale com o suporte.</Notice>;
  return (
    <Notice tone={p.verification === "rejected" ? "bad" : "gold"}>
      {p.verification === "rejected" ? "Verificação recusada. Revise e envie novamente." : "Seu perfil ainda não está visível. Complete o perfil e envie a verificação."}{" "}
      <button className="text-gold underline" onClick={() => go(p.headline && p.photos.length ? "verificacao" : "perfil")}>
        Continuar
      </button>
    </Notice>
  );
}

function Overview({ db, me, p, go }: { db: DB; me: User; p: Professional; go: (t: Tab) => void }) {
  const all = bookingsForOwner(db, me);
  const pending = all.filter((b) => b.status === "requested");
  const upcoming = all.filter((b) => b.status === "accepted" && b.date >= isoDate(new Date()));
  const { avg, count } = ratingOf(db, p.id);
  const favs = db.favorites.filter((f) => f.professionalId === p.id).length;
  const steps = [
    { done: !!p.headline && !!p.bio && p.categories.length > 0, label: "Descrição e categorias", tab: "perfil" as Tab },
    { done: p.photos.length > 0, label: "Fotografias", tab: "perfil" as Tab },
    { done: p.availability.length > 0, label: "Disponibilidade", tab: "agenda" as Tab },
    { done: p.verification === "verified" || p.verification === "pending", label: "Identidade e maioridade", tab: "verificacao" as Tab },
  ];
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar hue={p.hue} name={p.displayName} size={60} />
        <div>
          <p className="text-xl font-bold">{p.displayName}</p>
          <p className="text-xs text-ink-3">
            {p.region}, {p.city}
          </p>
        </div>
      </div>
      <StatusBanner p={p} go={go} />
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Pendentes", value: pending.length, icon: Inbox },
          { label: "Confirmadas", value: upcoming.length, icon: CalendarCheck2 },
          { label: count ? `${count} avaliações` : "Favoritado", value: count ? avg.toFixed(1) : favs, icon: count ? ShieldCheck : Eye },
        ].map((k) => (
          <Card key={k.label} className="p-3">
            <k.icon className="size-4 text-gold" strokeWidth={1.5} />
            <p className="mt-2 text-2xl font-bold leading-none">{k.value}</p>
            <p className="mt-1 text-[11px] text-ink-3">{k.label}</p>
          </Card>
        ))}
      </div>
      {p.status !== "published" && (
        <Card className="divide-y divide-line px-4">
          {steps.map((st) => (
            <button key={st.label} onClick={() => go(st.tab)} className="flex w-full items-center gap-3 py-3.5 text-left">
              {st.done ? <CheckCircle2 className="size-5 text-ok" /> : <span className="size-5 rounded-full border border-line-2" />}
              <span className={cn("flex-1 text-[15px]", st.done && "text-ink-3")}>{st.label}</span>
            </button>
          ))}
        </Card>
      )}
      <Link href="/planos" className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-gold-2 to-gold px-4 py-3.5 text-black">
        <span>
          <span className="block text-[15px] font-bold">{isPremium(me) ? "Perfil Premium ativo" : "Destaque seu perfil"}</span>
          <span className="text-xs">{isPremium(me) ? `até ${new Date(me.planUntil!).toLocaleDateString("pt-BR")}` : "Apareça primeiro na busca da sua cidade"}</span>
        </span>
        <span className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-gold">{isPremium(me) ? "Gerenciar" : "Ver planos"}</span>
      </Link>
      {pending.length > 0 && (
        <Button variant="outline" className="w-full" onClick={() => go("solicitacoes")}>
          Responder {pending.length} {pending.length === 1 ? "solicitação" : "solicitações"}
        </Button>
      )}
    </div>
  );
}

function Availability({ p }: { p: Professional }) {
  const [slots, setSlots] = useState<WeeklySlot[]>(p.availability);
  const [step, setStep] = useState(String(p.slotMinutes));
  const [blocked, setBlocked] = useState<string[]>(p.blockedDates);
  const [newBlock, setNewBlock] = useState("");
  const [saved, setSaved] = useState(false);
  const invalid = slots.some((s) => s.start >= s.end);
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-3">Defina seus horários semanais. Clientes só podem solicitar dentro deles; cada solicitação ainda depende da sua confirmação.</p>
      <WeeklyEditor value={slots} onChange={(v) => (setSlots(v), setSaved(false))} />
      <Field label="Intervalo entre horários">
        <Select value={step} onChange={(v) => (setStep(v), setSaved(false))} options={["30", "60", "90", "120"]} />
      </Field>
      <div>
        <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">Dias bloqueados</p>
        <div className="flex gap-2">
          <Input type="date" value={newBlock} min={isoDate(new Date())} onChange={(e) => setNewBlock(e.target.value)} />
          <Button variant="outline" disabled={!newBlock} onClick={() => (setBlocked([...new Set([...blocked, newBlock])].sort()), setNewBlock(""), setSaved(false))}>
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {blocked.map((d) => (
            <Badge key={d}>
              {d.split("-").reverse().join("/")}
              <button aria-label="Remover" onClick={() => setBlocked(blocked.filter((x) => x !== d))}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>
      {invalid && <Notice tone="bad">O horário final precisa ser depois do inicial.</Notice>}
      <Button className="w-full" disabled={invalid} onClick={() => (updateMyProfessional({ availability: slots, slotMinutes: Number(step), blockedDates: blocked }), setSaved(true))}>
        {saved ? "Salvo ✓" : "Salvar disponibilidade"}
      </Button>
    </div>
  );
}

function ProfileEditor({ p }: { p: Professional }) {
  const [f, setF] = useState({
    displayName: p.displayName,
    headline: p.headline,
    bio: p.bio,
    city: p.city,
    region: p.region,
    categories: p.categories,
    kind: p.kind,
    tags: p.tags,
    serviceLocations: p.serviceLocations,
    languages: p.languages.join(", "),
    priceFrom: p.priceFrom ? String(p.priceFrom) : "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [caption, setCaption] = useState("");

  function save() {
    try {
      updateMyProfessional({
        displayName: f.displayName.trim(),
        headline: f.headline.trim(),
        bio: f.bio.trim(),
        city: f.city,
        region: f.region,
        categories: f.categories,
        kind: f.kind,
        tags: f.tags,
        serviceLocations: f.serviceLocations.length ? f.serviceLocations : ["A combinar"],
        languages: f.languages.split(",").map((x) => x.trim()).filter(Boolean),
        priceFrom: f.priceFrom ? Number(f.priceFrom) : null,
      });
      setMsg({ ok: true, text: "Perfil salvo." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof AppError ? e.message : "Erro" });
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">Fotografias autorizadas · {p.photos.length}/8</p>
        <div className="grid grid-cols-3 gap-2">
          {p.photos.map((ph) => (
            <Art key={ph.id} hue={ph.hue} label={p.displayName} className="aspect-[3/4] rounded-2xl">
              <button aria-label="Remover foto" onClick={() => removePhoto(ph.id)} className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/50">
                <Trash2 className="size-3.5" />
              </button>
              <Badge tone={ph.status === "approved" ? "ok" : ph.status === "pending" ? "warn" : "bad"} className="absolute bottom-1.5 left-1.5">
                {ph.status === "approved" ? "Aprovada" : ph.status === "pending" ? "Em análise" : "Recusada"}
              </Badge>
            </Art>
          ))}
          {p.photos.length < 8 && (
            <label className="grid aspect-[3/4] cursor-pointer place-items-center rounded-2xl border border-dashed border-line-2 text-ink-3 hover:border-gold-3 hover:text-gold">
              <span className="flex flex-col items-center gap-1 text-xs">
                <ImagePlus className="size-5" /> Adicionar
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) addPhoto(caption || e.target.files[0].name.replace(/\.\w+$/, ""));
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda da próxima foto (opcional)" className="mt-2 h-10 text-sm" />
        <p className="mt-2 text-[11px] text-ink-3">Envie apenas fotos suas, recentes e sem nudez. Metadados (EXIF/GPS) são removidos e toda foto passa por moderação antes de aparecer.</p>
      </section>

      <Field label="Nome de exibição">
        <Input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
      </Field>
      <Field label="Título">
        <Input value={f.headline} maxLength={60} onChange={(e) => setF({ ...f, headline: e.target.value })} placeholder="Ex.: Elegância para jantares e eventos" />
      </Field>
      <Field label="Descrição" hint="Sem dados de contato, links ou descrições de atos íntimos.">
        <Textarea value={f.bio} maxLength={800} onChange={(e) => setF({ ...f, bio: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cidade">
          <Select value={f.city} onChange={(v) => setF({ ...f, city: v, region: CITIES[v][0] })} options={Object.keys(CITIES)} />
        </Field>
        <Field label="Região">
          <Select value={f.region} onChange={(v) => setF({ ...f, region: v })} options={CITIES[f.city] ?? []} />
        </Field>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">Categorias</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={f.categories.includes(c)} onClick={() => setF({ ...f, categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] })}>
              {c}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">Tipo de perfil</p>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <Chip key={k} active={f.kind === k} onClick={() => setF({ ...f, kind: k })}>
              {k}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">Etiquetas</p>
        <div className="flex flex-wrap gap-2">
          {TAGS.map((t) => (
            <Chip key={t} active={f.tags.includes(t)} onClick={() => setF({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t].slice(0, 4) })}>
              {t}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">Local de atendimento</p>
        <div className="flex flex-wrap gap-2">
          {SERVICE_LOCATIONS.map((l) => (
            <Chip
              key={l}
              active={f.serviceLocations.includes(l)}
              onClick={() => setF({ ...f, serviceLocations: f.serviceLocations.includes(l) ? f.serviceLocations.filter((x) => x !== l) : [...f.serviceLocations, l] })}
            >
              {l}
            </Chip>
          ))}
        </div>
      </div>
      <Field label="Idiomas" hint="Separados por vírgula">
        <Input value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} />
      </Field>
      {FEATURES.priceInfo && (
        <Field label="Valor de referência (opcional)" hint="Apenas informativo. A plataforma não processa pagamentos.">
          <Input inputMode="numeric" value={f.priceFrom} onChange={(e) => setF({ ...f, priceFrom: e.target.value.replace(/\D/g, "") })} placeholder="R$" />
        </Field>
      )}
      {msg && <Notice tone={msg.ok ? "gold" : "bad"}>{msg.text}</Notice>}
      <Button className="w-full" onClick={save}>
        Salvar perfil
      </Button>
    </div>
  );
}

function VerificationForm({ db, p }: { db: DB; p: Professional }) {
  const last = db.verifications.find((v) => v.professionalId === p.id);
  const [legalName, setLegalName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [documentType, setDocumentType] = useState<"RG" | "CNH" | "Passaporte">("CNH");
  const [doc, setDoc] = useState("");
  const [selfie, setSelfie] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (p.verification === "verified")
    return (
      <Empty
        icon={<ShieldCheck className="size-5" />}
        title="Identidade verificada"
        text="Seu selo de verificação está ativo. Seus documentos ficam guardados de forma criptografada e só a equipe de verificação tem acesso."
      />
    );
  if (p.verification === "pending")
    return <Empty icon={<Clock className="size-5" />} title="Em análise" text={`Enviado em ${last ? new Date(last.createdAt).toLocaleDateString("pt-BR") : "—"}. Você será notificada(o) quando concluirmos.`} />;

  function submit() {
    setError(null);
    try {
      submitVerification({ legalName, birthdate, documentType, documentFile: doc, selfieFile: selfie });
    } catch (e) {
      setError(e instanceof AppError ? e.message : "Erro");
    }
  }


  return (
    <div className="space-y-4">
      {p.verification === "rejected" && last?.notes && <Notice tone="bad">Motivo da recusa: {last.notes}</Notice>}
      <Notice>
        Para proteger todos, verificamos identidade e maioridade de cada perfil. Os documentos ficam em armazenamento privado e criptografado, acessível somente à equipe de verificação, e nunca são exibidos.
      </Notice>
      <Field label="Nome completo (como no documento)">
        <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} autoComplete="name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nascimento">
          <Input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
        </Field>
        <Field label="Documento">
          <Select value={documentType} onChange={(v) => setDocumentType(v as typeof documentType)} options={["CNH", "RG", "Passaporte"]} />
        </Field>
      </div>
      <FileBox label="Documento (frente e verso)" value={doc} onPick={setDoc} icon={FileCheck2} />
      <FileBox label="Selfie segurando o documento" value={selfie} onPick={setSelfie} icon={Camera} capture />
      <label className="flex items-start gap-3 text-[13px] text-ink-2">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#e0ad3e]" />
        Declaro que tenho 18 anos ou mais, que atuo de forma independente e por livre vontade, sem intermediários, e autorizo o tratamento destes dados para verificação (LGPD, art. 11).
      </label>
      {error && <Notice tone="bad">{error}</Notice>}
      <Button className="w-full" disabled={!consent} onClick={submit}>
        Enviar para verificação
      </Button>
    </div>
  );
}

function FileBox({ label, value, onPick, icon: Icon, capture }: { label: string; value: string; onPick: (n: string) => void; icon: typeof Camera; capture?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-4 py-4 transition", value ? "border-ok/50" : "border-line-2 hover:border-gold-3")}>
      <Icon className={cn("size-5", value ? "text-ok" : "text-gold")} strokeWidth={1.5} />
      <span className="flex-1 text-sm">
        {label}
        <span className="block truncate text-xs text-ink-3">{value || "Toque para enviar"}</span>
      </span>
      <input type="file" accept="image/*,application/pdf" capture={capture ? "user" : undefined} className="hidden" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0].name)} />
    </label>
  );
}
