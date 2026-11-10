"use client";

import {
  AudioLines,
  BrainCircuit,
  Cpu,
  FolderPlus,
  HardDrive,
  Info,
  RefreshCw,
  Save,
  Server,
  Wand2,
  Wrench,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { ServiceStateBadge, ServiceStateIcon } from "@/components/status";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  PageHeader,
  PhaseBadge,
  Skeleton,
  cx,
  inputClass,
} from "@/components/ui";
import { api, ApiError, type FieldError } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type {
  FolderStatus,
  StorageKey,
  StorageStatus,
  SystemStatus,
  UserSettings,
  WhisperLanguage,
  WhisperModel,
} from "@/lib/types";
import { useApi } from "@/lib/use-api";

import { WhisperModels } from "./whisper-models";

const STORAGE_FIELDS: Array<{ key: StorageKey; label: string; folder: string; hint: string }> = [
  { key: "originals", label: "Originais", folder: "originals", hint: "Lives e gravações brutas." },
  {
    key: "processing",
    label: "Em processamento",
    folder: "processing",
    hint: "Arquivos temporários.",
  },
  { key: "clips", label: "Cortes", folder: "clips", hint: "Cortes renderizados para revisão." },
  {
    key: "exports",
    label: "Exportações",
    folder: "exports",
    hint: "Vídeos finais prontos para publicar.",
  },
];

const WHISPER_MODELS: Array<{ value: WhisperModel; label: string }> = [
  { value: "tiny", label: "tiny — mais rápido, menos preciso" },
  { value: "base", label: "base — rápido" },
  { value: "small", label: "small — recomendado" },
  { value: "medium", label: "medium — mais preciso, mais lento" },
  { value: "large-v3", label: "large-v3 — lento demais na CPU" },
];

type Notice = { tone: "ok" | "bad"; text: string; fields?: FieldError[] } | null;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function joinPath(root: string, folder: string): string {
  const clean = root.trim().replace(/[\\/]+$/, "");
  const sep = /^[A-Za-z]:/.test(clean) || clean.includes("\\") ? "\\" : "/";
  return `${clean}${sep}${folder}`;
}

/* ------------------------------------------------------- Folder status */

function FolderStatusLine({ status, dirty }: { status?: FolderStatus; dirty: boolean }) {
  if (dirty) return <span className="text-warn">Alteração não salva.</span>;
  if (!status) return null;
  const tone = status.writable ? "text-ok" : status.configured ? "text-warn" : "text-ink-faint";
  return (
    <span className={tone}>
      {status.message}
      {status.free_bytes !== null && status.configured ? (
        <span className="text-ink-faint">
          {" "}
          · {formatBytes(status.free_bytes)} livres de {formatBytes(status.total_bytes)}
        </span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------- Services list */

function ServicesSection() {
  const [refreshKey, setRefreshKey] = useState(0);
  const path = refreshKey === 0 ? "/system/status" : `/system/status?refresh=true&k=${refreshKey}`;
  const { data, error, loading, reload } = useApi<SystemStatus>(path);

  return (
    <div id="servicos" className="scroll-mt-24 space-y-4">
      <Card
        title="Status dos serviços"
        icon={Server}
        action={
          <Button
            variant="ghost"
            icon={RefreshCw}
            loading={loading && data !== null}
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Verificar novamente
          </Button>
        }
      >
        {error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : !data ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data.services.map((s) => (
              <li key={s.key} className="flex items-start gap-3 py-3">
                <span className="mt-0.5">
                  <ServiceStateIcon state={s.state} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                    {s.name}
                    {s.version ? (
                      <span className="font-mono text-[11px] text-ink-faint">{s.version}</span>
                    ) : null}
                  </p>
                  <p className="break-all text-xs text-ink-muted">{s.detail}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                  {s.phase && s.phase > 1 ? (
                    <span className="text-[11px] text-ink-faint">usado na Fase {s.phase}</span>
                  ) : null}
                  <ServiceStateBadge state={s.state} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Sistema" icon={Cpu}>
        {!data ? (
          <Skeleton className="h-20" />
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["Sistema operacional", data.host.os],
              ["Arquitetura", data.host.machine],
              ["Threads de CPU", data.host.cpu_threads?.toString() ?? "—"],
              ["Python do backend", data.host.python_version],
              ["Versão do GTA Clips AI", data.host.app_version],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line bg-surface/50 px-3 py-2">
                <dt className="text-xs text-ink-faint">{label}</dt>
                <dd className="mt-0.5 break-all text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- Settings form */

export function SettingsView() {
  const settingsReq = useApi<UserSettings>("/settings");

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Armazenamento, ferramentas e status dos serviços locais. Tudo roda neste computador, sem nuvem."
      />

      {settingsReq.error ? (
        <ErrorState message={settingsReq.error.message} onRetry={settingsReq.reload} />
      ) : !settingsReq.data ? (
        <div className="space-y-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <SettingsForm initial={settingsReq.data} />
      )}

      <div className="mt-8">
        <ServicesSection />
      </div>
    </>
  );
}

function SettingsForm({ initial }: { initial: UserSettings }) {
  const storageReq = useApi<StorageStatus>("/settings/storage/status");

  const [form, setForm] = useState<UserSettings>(initial);
  const [saved, setSaved] = useState<UserSettings>(initial);
  const [root, setRoot] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // Latest status returned by an action; falls back to the initial fetch.
  const [storageOverride, setStorage] = useState<StorageStatus | null>(null);
  const storage = storageOverride ?? storageReq.data;

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const storageDirty = (key: StorageKey) => form.storage[key] !== saved.storage[key];
  const anyConfigured = Object.values(saved.storage).some((v) => v !== null);
  const statusByKey = new Map(storage?.folders.map((f) => [f.key, f]));

  function update<S extends keyof UserSettings>(section: S, patch: Partial<UserSettings[S]>) {
    setForm((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
    setNotice(null);
  }

  function fillFromRoot() {
    if (!root.trim()) return;
    const storagePatch = Object.fromEntries(
      STORAGE_FIELDS.map((f) => [f.key, joinPath(root, f.folder)]),
    ) as Record<StorageKey, string>;
    update("storage", storagePatch);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const payload: UserSettings = {
      storage: Object.fromEntries(
        Object.entries(form.storage).map(([k, v]) => [k, emptyToNull(v ?? "")]),
      ) as UserSettings["storage"],
      tools: {
        ffmpeg_path: emptyToNull(form.tools.ffmpeg_path ?? ""),
        ffprobe_path: emptyToNull(form.tools.ffprobe_path ?? ""),
      },
      ai: { ...form.ai, ollama_base_url: form.ai.ollama_base_url.trim() },
    };
    try {
      const result = await api.put<UserSettings>("/settings", payload);
      setForm(result);
      setSaved(result);
      setStorage(await api.get<StorageStatus>("/settings/storage/status"));
      setNotice({ tone: "ok", text: "Configurações salvas." });
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      setNotice({ tone: "bad", text: e?.message ?? "Erro ao salvar.", fields: e?.fields });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateFolders() {
    setCreating(true);
    setNotice(null);
    try {
      const result = await api.post<StorageStatus>("/settings/storage/create-folders");
      setStorage(result);
      setNotice(
        result.all_ready
          ? { tone: "ok", text: "Todas as pastas estão prontas." }
          : {
              tone: "bad",
              text: "Algumas pastas não puderam ser criadas. Veja o status de cada uma.",
            },
      );
    } catch (err) {
      setNotice({
        tone: "bad",
        text: err instanceof ApiError ? err.message : "Erro ao criar pastas.",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4" noValidate>
      {/* ---------- Storage ---------- */}
      <Card
        title="Armazenamento de vídeos"
        icon={HardDrive}
        action={
          storage ? (
            <Badge tone={storage.all_ready ? "ok" : anyConfigured ? "warn" : "neutral"}>
              {storage.all_ready ? "Tudo pronto" : anyConfigured ? "Pendências" : "Não configurado"}
            </Badge>
          ) : null
        }
      >
        <div className="mb-5 flex gap-3 rounded-xl border border-accent/20 bg-accent/[0.05] p-3 text-xs text-ink-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-accent-soft" aria-hidden />
          <p>
            Os vídeos ficam no HD externo; código, banco de dados e modelos ficam no SSD. A letra da
            unidade (ex.: <code className="font-mono text-ink">E:</code>) ainda precisa ser
            confirmada. Ela pode mudar ao reconectar o HD, e o sistema avisa quando a unidade não
            for encontrada.
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field
              label="Atalho: pasta raiz no HD externo"
              htmlFor="root"
              hint="Preenche as quatro pastas abaixo de uma vez. Nada é salvo até você clicar em Salvar."
            >
              <input
                id="root"
                className={inputClass}
                placeholder="E:\GTA-CLIPS-AI"
                value={root}
                onChange={(e) => setRoot(e.target.value)}
              />
            </Field>
          </div>
          <Button icon={Wand2} onClick={fillFromRoot} disabled={!root.trim()} className="sm:mb-6">
            Preencher pastas
          </Button>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {STORAGE_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              htmlFor={`storage-${f.key}`}
              hint={
                <>
                  {f.hint}{" "}
                  <FolderStatusLine status={statusByKey.get(f.key)} dirty={storageDirty(f.key)} />
                </>
              }
            >
              <input
                id={`storage-${f.key}`}
                className={cx(inputClass, "font-mono text-[13px]")}
                placeholder={`E:\\GTA-CLIPS-AI\\${f.folder}`}
                value={form.storage[f.key] ?? ""}
                onChange={(e) => update("storage", { [f.key]: e.target.value })}
                spellCheck={false}
              />
            </Field>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button
            icon={FolderPlus}
            onClick={handleCreateFolders}
            loading={creating}
            disabled={!anyConfigured || dirty}
            title={dirty ? "Salve as alterações antes de criar as pastas" : undefined}
          >
            Criar pastas que faltam
          </Button>
          <Button
            variant="ghost"
            icon={RefreshCw}
            onClick={async () => {
              try {
                setStorage(await api.get<StorageStatus>("/settings/storage/status"));
              } catch (err) {
                setNotice({ tone: "bad", text: err instanceof ApiError ? err.message : "Erro." });
              }
            }}
          >
            Verificar status
          </Button>
          {dirty ? (
            <span className="text-xs text-warn">Salve antes de criar as pastas.</span>
          ) : null}
        </div>
      </Card>

      {/* ---------- Tools ---------- */}
      <Card title="Ferramentas" icon={Wrench}>
        <p className="mb-4 text-xs text-ink-muted">
          Deixe em branco para usar o FFmpeg instalado no PATH do Windows. Por segurança, só são
          aceitos os executáveis <code className="font-mono text-ink">ffmpeg.exe</code> e{" "}
          <code className="font-mono text-ink">ffprobe.exe</code>.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Caminho do FFmpeg (opcional)" htmlFor="ffmpeg">
            <input
              id="ffmpeg"
              className={cx(inputClass, "font-mono text-[13px]")}
              placeholder="C:\ffmpeg\bin\ffmpeg.exe"
              value={form.tools.ffmpeg_path ?? ""}
              onChange={(e) => update("tools", { ffmpeg_path: e.target.value })}
              spellCheck={false}
            />
          </Field>
          <Field label="Caminho do FFprobe (opcional)" htmlFor="ffprobe">
            <input
              id="ffprobe"
              className={cx(inputClass, "font-mono text-[13px]")}
              placeholder="C:\ffmpeg\bin\ffprobe.exe"
              value={form.tools.ffprobe_path ?? ""}
              onChange={(e) => update("tools", { ffprobe_path: e.target.value })}
              spellCheck={false}
            />
          </Field>
        </div>
      </Card>

      {/* ---------- AI ---------- */}
      <Card title="Transcrição (Whisper)" icon={AudioLines}>
        <div className="mb-5 grid gap-5 md:grid-cols-3">
          <Field label="Modelo" htmlFor="whisper" hint="Roda na CPU (int8). small é o recomendado.">
            <select
              id="whisper"
              className={inputClass}
              value={form.ai.whisper_model}
              onChange={(e) => update("ai", { whisper_model: e.target.value as WhisperModel })}
            >
              {WHISPER_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Idioma das lives"
            htmlFor="whisper-lang"
            hint="Fixar o idioma evita erros de detecção."
          >
            <select
              id="whisper-lang"
              className={inputClass}
              value={form.ai.whisper_language}
              onChange={(e) =>
                update("ai", { whisper_language: e.target.value as WhisperLanguage })
              }
            >
              <option value="pt">Português</option>
              <option value="auto">Detectar automaticamente</option>
              <option value="en">Inglês</option>
              <option value="es">Espanhol</option>
            </select>
          </Field>
          <Field
            label="Threads de CPU"
            htmlFor="whisper-threads"
            hint="0 = automático (1 por núcleo físico; 6 no Ryzen 5 5500)."
          >
            <input
              id="whisper-threads"
              type="number"
              min={0}
              max={64}
              className={inputClass}
              value={form.ai.whisper_cpu_threads}
              onChange={(e) =>
                update("ai", {
                  whisper_cpu_threads: Math.max(0, Math.min(64, Number(e.target.value) || 0)),
                })
              }
            />
          </Field>
        </div>
        <WhisperModels selected={saved.ai.whisper_model} />
      </Card>

      <Card title="Análise com IA (Ollama)" icon={BrainCircuit}>
        <p className="mb-4 text-xs text-ink-muted">
          Estas preferências já ficam salvas, mas só passam a ser usadas na Fase 4.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="Endereço do Ollama"
            htmlFor="ollama-url"
            hint={
              <span className="inline-flex items-center gap-1.5">
                Somente local <PhaseBadge phase={4} />
              </span>
            }
          >
            <input
              id="ollama-url"
              className={cx(inputClass, "font-mono text-[13px]")}
              value={form.ai.ollama_base_url}
              onChange={(e) => update("ai", { ollama_base_url: e.target.value })}
              spellCheck={false}
            />
          </Field>
          <Field
            label="Modelo de análise"
            htmlFor="ollama-model"
            hint={
              <span className="inline-flex items-center gap-1.5">
                Qwen3 4B quantizado <PhaseBadge phase={4} />
              </span>
            }
          >
            <input
              id="ollama-model"
              className={cx(inputClass, "font-mono text-[13px]")}
              value={form.ai.ollama_model}
              onChange={(e) => update("ai", { ollama_model: e.target.value })}
              spellCheck={false}
            />
          </Field>
        </div>
      </Card>

      {/* ---------- Save bar ---------- */}
      <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface/90 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 text-sm" aria-live="polite">
          {notice ? (
            <div className={notice.tone === "ok" ? "text-ok" : "text-bad"}>
              {notice.text}
              {notice.fields && notice.fields.length > 0 ? (
                <ul className="mt-1 list-inside list-disc text-xs">
                  {notice.fields.map((f) => (
                    <li key={`${f.field}-${f.message}`}>{f.message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : dirty ? (
            <span className="text-warn">Você tem alterações não salvas.</span>
          ) : (
            <span className="text-ink-faint">Nenhuma alteração pendente.</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() => {
              setForm(saved);
              setNotice(null);
            }}
          >
            Descartar
          </Button>
          <Button type="submit" variant="primary" icon={Save} loading={saving} disabled={!dirty}>
            Salvar
          </Button>
        </div>
      </div>
    </form>
  );
}
