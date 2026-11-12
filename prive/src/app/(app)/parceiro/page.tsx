"use client";

import { useState } from "react";
import { Building2, ImagePlus, Pencil, Plus } from "lucide-react";

import { Art } from "@/components/art";
import { useSession } from "@/components/guard";
import { Requests, WeeklyEditor } from "@/components/owner";
import { Badge, Button, Card, Chip, Empty, Field, Input, Notice, Select, Spinner, Textarea, TopBar } from "@/components/ui";
import { CITIES } from "@/lib/config";
import { AppError, addEstablishmentPhoto, saveEstablishment } from "@/lib/db";
import type { Establishment, WeeklySlot } from "@/lib/types";

const KINDS = ["Hotel boutique", "Hotel", "Lounge & bar", "Restaurante", "Spa urbano"];
const STATUS = {
  approved: { label: "Aprovado", tone: "ok" as const },
  pending: { label: "Em análise", tone: "warn" as const },
  suspended: { label: "Suspenso", tone: "bad" as const },
};

export default function PartnerPage() {
  const s = useSession(["partner"]);
  const [tab, setTab] = useState<"locais" | "reservas">("locais");
  const [editing, setEditing] = useState<Establishment | "new" | null>(null);
  if (!s) return <Spinner />;
  const mine = s.db.establishments.filter((e) => e.ownerId === s.me.id);

  if (editing) return <EstablishmentForm initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />;

  return (
    <>
      <TopBar title="Estabelecimento parceiro" />
      <div className="mb-5 flex gap-2">
        <Chip active={tab === "locais"} onClick={() => setTab("locais")}>
          Meus locais · {mine.length}
        </Chip>
        <Chip active={tab === "reservas"} onClick={() => setTab("reservas")}>
          Reservas
        </Chip>
      </div>

      {tab === "reservas" ? (
        <Requests db={s.db} me={s.me} />
      ) : (
        <>
          {mine.length === 0 ? (
            <Empty icon={<Building2 className="size-5" />} title="Cadastre seu estabelecimento" text="Hotéis, lounges, restaurantes e spas com alvará válido." />
          ) : (
            <div className="space-y-4">
              {mine.map((e) => (
                <Card key={e.id} className="overflow-hidden">
                  <Art hue={e.hue} label={e.name} className="aspect-[16/8] rounded-none">
                    <Badge tone={STATUS[e.status].tone} className="absolute top-3 left-3">
                      {STATUS[e.status].label}
                    </Badge>
                  </Art>
                  <div className="p-4">
                    <p className="text-[10px] tracking-[0.25em] text-gold uppercase">{e.kind}</p>
                    <p className="font-display text-xl">{e.name}</p>
                    <p className="text-xs text-ink-3">{e.address}</p>
                    <p className="mt-2 text-xs text-ink-3">
                      {e.photos.length} fotos · {s.db.bookings.filter((b) => b.establishmentId === e.id && b.status === "requested").length} solicitações pendentes
                    </p>
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" className="h-10 flex-1" onClick={() => setEditing(e)}>
                        <Pencil className="size-4" /> Editar
                      </Button>
                      <label className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-line-2 text-sm hover:border-gold-3">
                        <ImagePlus className="size-4" /> Foto
                        <input type="file" accept="image/*" className="hidden" onChange={(ev) => ev.target.files?.[0] && addEstablishmentPhoto(e.id, ev.target.files[0].name.replace(/\.\w+$/, ""))} />
                      </label>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <Button className="mt-5 w-full" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Novo estabelecimento
          </Button>
        </>
      )}
    </>
  );
}

function EstablishmentForm({ initial, onDone }: { initial: Establishment | null; onDone: () => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    kind: initial?.kind ?? KINDS[0],
    city: initial?.city ?? "São Paulo",
    region: initial?.region ?? CITIES["São Paulo"][0],
    address: initial?.address ?? "",
    description: initial?.description ?? "",
    amenities: initial?.amenities.join(", ") ?? "",
    licenseNumber: initial?.licenseNumber ?? "",
  });
  const [availability, setAvailability] = useState<WeeklySlot[]>(initial?.availability ?? []);
  const [error, setError] = useState<string | null>(null);

  function save() {
    try {
      saveEstablishment({
        id: initial?.id,
        ...f,
        amenities: f.amenities.split(",").map((x) => x.trim()).filter(Boolean),
        availability,
      });
      onDone();
    } catch (e) {
      setError(e instanceof AppError ? e.message : "Erro");
    }
  }

  return (
    <>
      <TopBar title={initial ? "Editar local" : "Novo local"} right={<Button variant="ghost" className="h-9" onClick={onDone}>Cancelar</Button>} />
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Tipo">
          <Select value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={KINDS} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cidade">
            <Select value={f.city} onChange={(v) => setF({ ...f, city: v, region: CITIES[v][0] })} options={Object.keys(CITIES)} />
          </Field>
          <Field label="Região">
            <Select value={f.region} onChange={(v) => setF({ ...f, region: v })} options={CITIES[f.city] ?? []} />
          </Field>
        </div>
        <Field label="Endereço">
          <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} autoComplete="street-address" />
        </Field>
        <Field label="Descrição">
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={600} />
        </Field>
        <Field label="Comodidades" hint="Separadas por vírgula">
          <Input value={f.amenities} onChange={(e) => setF({ ...f, amenities: e.target.value })} />
        </Field>
        <Field label="Alvará de funcionamento" hint="Alterar o alvará envia o local de volta para análise.">
          <Input value={f.licenseNumber} onChange={(e) => setF({ ...f, licenseNumber: e.target.value })} />
        </Field>
        <div>
          <p className="mb-2 text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">Horário para reservas</p>
          <WeeklyEditor value={availability} onChange={setAvailability} />
        </div>
        <Notice tone="mute">
          Reservas aqui se limitam a serviços do próprio estabelecimento (mesas, salas, suítes). É proibido usar o PRIVÉ para intermediar ou lucrar com serviços de terceiros.
        </Notice>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button className="w-full" onClick={save}>
          {initial ? "Salvar alterações" : "Enviar para análise"}
        </Button>
      </div>
    </>
  );
}
