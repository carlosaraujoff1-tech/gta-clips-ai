"use client";

/**
 * Camada de dados do PRIVÉ.
 *
 * Em MODO DEMONSTRAÇÃO (sem variáveis do Supabase) os dados ficam no navegador
 * (localStorage), com as MESMAS regras de negócio e permissões que as políticas
 * RLS aplicam no banco real (supabase/migrations/0001_init.sql). As telas só
 * falam com as funções exportadas aqui, então trocar para o Supabase não muda a UI.
 */
import { useSyncExternalStore } from "react";

import { CITIES, PLANS, URGENT_REASONS, type PlanId } from "./config";
import { fromMinutes, isoDate, parseIso, toMinutes, uid } from "./format";
import { hashPassword, isAdult, passwordIssues, scanMessage } from "./safety";
import { buildSeed } from "./seed";
import type {
  AdminPermission,
  Booking,
  BookingStatus,
  DB,
  Establishment,
  Payment,
  Professional,
  ReportTarget,
  Role,
  User,
  VerificationRequest,
} from "./types";

const KEY = "prive.db.v3";
let state: DB | null = null;
const listeners = new Set<() => void>();

function load(): DB {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      state = JSON.parse(raw) as DB;
      return state;
    }
  } catch {
    /* armazenamento indisponível: segue em memória */
  }
  state = buildSeed();
  persist();
  return state;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignora */
  }
}

function commit(mutator: (draft: DB) => void) {
  const next = structuredClone(load());
  mutator(next);
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Retorna o banco (ou null durante a renderização no servidor). */
export function useDB(): DB | null {
  return useSyncExternalStore(subscribe, load, () => null);
}

export function resetDemo() {
  state = buildSeed();
  persist();
  listeners.forEach((l) => l());
}

const now = () => new Date().toISOString();

export class AppError extends Error {}

// ───────────────────────── Sessão & autorização ─────────────────────────

export function currentUser(db: DB | null): User | null {
  if (!db?.sessionUserId) return null;
  return db.users.find((u) => u.id === db.sessionUserId && u.status === "active") ?? null;
}

function requireUser(db: DB, roles?: Role[]): User {
  const u = currentUser(db);
  if (!u) throw new AppError("Sessão expirada. Entre novamente.");
  if (roles && !roles.includes(u.role)) throw new AppError("Você não tem permissão para esta ação.");
  return u;
}

export function hasPermission(db: DB, userId: string, perm: AdminPermission): boolean {
  return db.adminPermissions[userId]?.includes(perm) ?? false;
}

function requirePermission(db: DB, perm: AdminPermission): User {
  const u = requireUser(db, ["admin"]);
  if (!hasPermission(db, u.id, perm)) throw new AppError("Permissão administrativa insuficiente.");
  return u;
}

function audit(d: DB, actorId: string, action: string, targetType: string, targetId: string, details = "") {
  d.audit.unshift({ id: uid(), actorId, action, targetType, targetId, details, createdAt: now() });
}

function notify(d: DB, userId: string, title: string, body: string, href: string) {
  d.notifications.unshift({ id: uid(), userId, title, body, href, read: false, createdAt: now() });
}

// ───────────────────────── Autenticação ─────────────────────────

export async function signIn(email: string, password: string) {
  const db = load();
  const hash = await hashPassword(password);
  const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!u || u.passHash !== hash) throw new AppError("E-mail ou senha incorretos.");
  if (u.status !== "active") throw new AppError("Conta suspensa. Fale com o suporte.");
  commit((d) => {
    d.sessionUserId = u.id;
  });
  return u;
}

let signedOutAt = 0;
/** true logo após um logout voluntário (evita anexar ?next= ao redirecionar). */
export const justSignedOut = () => Date.now() - signedOutAt < 3000;

export function signOut() {
  signedOutAt = Date.now();
  commit((d) => {
    d.sessionUserId = null;
  });
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
  birthdate: string;
  role: "client" | "professional" | "partner";
  acceptTerms: boolean;
  confirmAdult: boolean;
}) {
  const db = load();
  if (!input.name.trim()) throw new AppError("Informe seu nome.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new AppError("E-mail inválido.");
  const pw = passwordIssues(input.password);
  if (pw) throw new AppError(pw);
  if (!input.birthdate || !isAdult(input.birthdate))
    throw new AppError("O PRIVÉ é exclusivo para maiores de 18 anos.");
  if (!input.confirmAdult) throw new AppError("Confirme que você tem 18 anos ou mais.");
  if (!input.acceptTerms) throw new AppError("É preciso aceitar os Termos e a Política de Privacidade.");
  if (db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase()))
    throw new AppError("Este e-mail já está cadastrado.");

  const passHash = await hashPassword(input.password);
  const id = uid();
  commit((d) => {
    const ts = now();
    d.users.push({
      id,
      email: input.email.trim(),
      passHash,
      name: input.name.trim(),
      role: input.role,
      birthdate: input.birthdate,
      ageConfirmedAt: ts,
      status: "active",
      consent: { terms: true, privacy: true, adultsOnly: true, analytics: false, marketing: false, updatedAt: ts },
      hue: Math.floor(Math.random() * 360),
      createdAt: ts,
      discreetMode: false,
      plan: "free",
      planUntil: null,
    });
    if (input.role === "professional") {
      d.professionals.push({
        id: uid(),
        userId: id,
        displayName: input.name.trim().split(" ")[0],
        headline: "",
        bio: "",
        city: "São Paulo",
        region: CITIES["São Paulo"][0],
        kind: "Mulheres",
        categories: [],
        tags: [],
        serviceLocations: ["A combinar"],
        languages: ["Português"],
        priceFrom: null,
        verification: "none",
        status: "draft",
        photos: [],
        availability: [],
        blockedDates: [],
        slotMinutes: 60,
        hue: Math.floor(Math.random() * 360),
        createdAt: ts,
      });
    }
    d.sessionUserId = id;
  });
}

export async function requestPasswordReset(email: string) {
  // No Supabase: supabase.auth.resetPasswordForEmail(email). A resposta é sempre
  // a mesma, exista ou não a conta, para não revelar quem está cadastrado.
  await new Promise((r) => setTimeout(r, 600));
  return email;
}

export async function changePassword(current: string, next: string) {
  const db = load();
  const u = requireUser(db);
  if (u.passHash !== (await hashPassword(current))) throw new AppError("Senha atual incorreta.");
  const pw = passwordIssues(next);
  if (pw) throw new AppError(pw);
  const hash = await hashPassword(next);
  commit((d) => {
    d.users.find((x) => x.id === u.id)!.passHash = hash;
  });
}

// ───────────────────────── Conta & privacidade ─────────────────────────

export function updateAccount(patch: Partial<Pick<User, "name" | "discreetMode" | "hue">>) {
  commit((d) => {
    const u = requireUser(d);
    Object.assign(d.users.find((x) => x.id === u.id)!, patch);
  });
}

export function updateConsent(patch: Partial<Pick<User["consent"], "analytics" | "marketing">>) {
  commit((d) => {
    const u = d.users.find((x) => x.id === requireUser(d).id)!;
    u.consent = { ...u.consent, ...patch, updatedAt: now() };
  });
}

/** Exportação de dados pessoais (LGPD art. 18, II e V). */
export function exportMyData(): string {
  const db = load();
  const u = requireUser(db);
  const { passHash: _omit, ...profile } = u;
  void _omit;
  return JSON.stringify(
    {
      exportedAt: now(),
      account: profile,
      professionalProfile: db.professionals.find((p) => p.userId === u.id) ?? null,
      bookings: db.bookings.filter((b) => b.clientId === u.id),
      favorites: db.favorites.filter((f) => f.userId === u.id),
      reviews: db.reviews.filter((r) => r.authorId === u.id),
      messages: db.messages.filter((m) => m.senderId === u.id),
      reportsFiled: db.reports.filter((r) => r.reporterId === u.id),
    },
    null,
    2,
  );
}

/** Exclusão de conta (LGPD art. 18, VI). Mantém apenas o registro mínimo de auditoria. */
export function deleteMyAccount() {
  commit((d) => {
    const u = requireUser(d);
    const pro = d.professionals.find((p) => p.userId === u.id);
    d.users = d.users.filter((x) => x.id !== u.id);
    d.favorites = d.favorites.filter((f) => f.userId !== u.id && f.professionalId !== pro?.id);
    d.notifications = d.notifications.filter((n) => n.userId !== u.id);
    d.blocks = d.blocks.filter((b) => b.userId !== u.id && b.blockedUserId !== u.id);
    d.bookings = d.bookings.map((b) =>
      (b.clientId === u.id || b.professionalId === pro?.id) && (b.status === "requested" || b.status === "accepted")
        ? { ...b, status: "cancelled" as const }
        : b,
    );
    d.messages = d.messages.map((m) => (m.senderId === u.id ? { ...m, text: "Mensagem removida", senderId: "deleted" } : m));
    if (pro) d.professionals = d.professionals.filter((p) => p.id !== pro.id);
    d.establishments = d.establishments.filter((e) => e.ownerId !== u.id);
    audit(d, u.id, "account.delete", "user", u.id, "Exclusão solicitada pelo titular.");
    d.sessionUserId = null;
  });
}

// ───────────────────────── Descoberta ─────────────────────────

export interface SearchFilters {
  q?: string;
  city?: string;
  region?: string;
  category?: string;
  kind?: string;
  weekday?: number | null;
  maxPrice?: number | null;
  verifiedOnly?: boolean;
}

export function isBlockedBetween(db: DB, a: string, b: string) {
  return db.blocks.some((x) => (x.userId === a && x.blockedUserId === b) || (x.userId === b && x.blockedUserId === a));
}

/** Só perfis publicados E com identidade verificada aparecem na busca (igual à RLS). */
export function searchProfessionals(db: DB, f: SearchFilters, viewerId?: string | null): Professional[] {
  const q = f.q?.trim().toLowerCase();
  return db.professionals.filter((p) => {
    if (p.status !== "published" || p.verification !== "verified") return false;
    if (viewerId && isBlockedBetween(db, viewerId, p.userId)) return false;
    if (f.city && p.city !== f.city) return false;
    if (f.region && p.region !== f.region) return false;
    if (f.category && !p.categories.includes(f.category)) return false;
    if (f.kind && p.kind !== f.kind) return false;
    if (f.weekday != null && !p.availability.some((s) => s.weekday === f.weekday)) return false;
    if (f.maxPrice && p.priceFrom && p.priceFrom > f.maxPrice) return false;
    if (q && !`${p.displayName} ${p.headline} ${p.region} ${p.city} ${p.categories.join(" ")}`.toLowerCase().includes(q))
      return false;
    return true;
  });
}

/** Foto de capa: primeira foto aprovada (ou a primeira, para o próprio dono/moderação). */
export function coverOf(p: { photos: { src?: string; status: string }[] }, includePending = false): string | undefined {
  return (p.photos.find((ph) => ph.src && (includePending || ph.status === "approved")) ?? undefined)?.src;
}

export function ratingOf(db: DB, professionalId: string) {
  const rs = db.reviews.filter((r) => r.professionalId === professionalId && r.status === "published");
  const avg = rs.length ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : 0;
  return { avg, count: rs.length, reviews: rs };
}

export function toggleFavorite(professionalId: string) {
  commit((d) => {
    const u = requireUser(d);
    const i = d.favorites.findIndex((f) => f.userId === u.id && f.professionalId === professionalId);
    if (i >= 0) d.favorites.splice(i, 1);
    else d.favorites.push({ userId: u.id, professionalId });
  });
}

// ───────────────────────── Disponibilidade & reservas ─────────────────────────

export function slotsFor(db: DB, target: { professional?: Professional; establishment?: Establishment }, date: string): string[] {
  const owner = target.professional ?? target.establishment;
  if (!owner) return [];
  const d = parseIso(date);
  if (date < isoDate(new Date())) return [];
  if (target.professional?.blockedDates.includes(date)) return [];
  const step = target.professional?.slotMinutes ?? 60;
  const taken = new Set(
    db.bookings
      .filter(
        (b) =>
          b.date === date &&
          (b.status === "requested" || b.status === "accepted") &&
          (target.professional ? b.professionalId === target.professional.id : b.establishmentId === target.establishment!.id),
      )
      .map((b) => b.time),
  );
  const out: string[] = [];
  const nowMin = date === isoDate(new Date()) ? new Date().getHours() * 60 + new Date().getMinutes() + 60 : -1;
  for (const s of owner.availability.filter((x) => x.weekday === d.getDay())) {
    for (let m = toMinutes(s.start); m + step <= toMinutes(s.end); m += step) {
      const t = fromMinutes(m);
      if (m > nowMin && !taken.has(t)) out.push(t);
    }
  }
  return out.sort();
}

export function requestBooking(input: {
  professionalId?: string;
  establishmentId?: string;
  date: string;
  time: string;
  durationMin: number;
  location?: string;
  note: string;
}) {
  let id = "";
  commit((d) => {
    const u = requireUser(d, ["client"]);
    const pro = input.professionalId ? d.professionals.find((p) => p.id === input.professionalId) : undefined;
    const est = input.establishmentId ? d.establishments.find((e) => e.id === input.establishmentId) : undefined;
    if (!pro && !est) throw new AppError("Perfil indisponível.");
    if (pro && (pro.status !== "published" || pro.verification !== "verified")) throw new AppError("Perfil indisponível.");
    if (est && est.status !== "approved") throw new AppError("Estabelecimento indisponível.");
    if (pro && isBlockedBetween(d, u.id, pro.userId)) throw new AppError("Não é possível solicitar este perfil.");
    if (!slotsFor(d, { professional: pro, establishment: est }, input.date).includes(input.time))
      throw new AppError("Esse horário acabou de ficar indisponível. Escolha outro.");
    const scan = scanMessage(input.note);
    id = uid();
    d.bookings.unshift({
      id,
      clientId: u.id,
      professionalId: pro?.id ?? null,
      establishmentId: est?.id ?? null,
      date: input.date,
      time: input.time,
      durationMin: input.durationMin,
      location: input.location ?? (est ? est.name : "A combinar"),
      note: scan.text.slice(0, 500),
      status: "requested",
      createdAt: now(),
      updatedAt: now(),
    });
    if (scan.risk) autoReport(d, "user", u.id, "Termo de risco em observação de reserva.");
    const ownerId = pro?.userId ?? est!.ownerId;
    notify(d, ownerId, "Nova solicitação", `${u.name} solicitou ${input.time} em ${input.date.split("-").reverse().join("/")}.`, pro ? "/profissional?tab=solicitacoes" : "/parceiro");
  });
  return id;
}

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ["accepted", "declined", "cancelled"],
  accepted: ["completed", "cancelled"],
  declined: [],
  cancelled: [],
  completed: [],
};

export function setBookingStatus(bookingId: string, status: BookingStatus) {
  commit((d) => {
    const u = requireUser(d);
    const b = d.bookings.find((x) => x.id === bookingId);
    if (!b) throw new AppError("Solicitação não encontrada.");
    const pro = b.professionalId ? d.professionals.find((p) => p.id === b.professionalId) : undefined;
    const est = b.establishmentId ? d.establishments.find((e) => e.id === b.establishmentId) : undefined;
    const isClient = b.clientId === u.id;
    const isOwner = pro?.userId === u.id || est?.ownerId === u.id;
    if (!isClient && !isOwner) throw new AppError("Sem permissão.");
    if (isClient && status !== "cancelled") throw new AppError("Sem permissão.");
    if (!TRANSITIONS[b.status].includes(status)) throw new AppError("Transição inválida.");
    b.status = status;
    b.updatedAt = now();
    const label = { accepted: "confirmada", declined: "recusada", cancelled: "cancelada", completed: "concluída", requested: "" }[status];
    const otherId = isClient ? (pro?.userId ?? est!.ownerId) : b.clientId;
    notify(d, otherId, `Reserva ${label}`, `${shortName(d, b)} · ${b.date.split("-").reverse().join("/")} às ${b.time}`, isClient ? "/profissional?tab=solicitacoes" : "/reservas");
  });
}

function shortName(d: DB, b: Booking) {
  return (
    d.professionals.find((p) => p.id === b.professionalId)?.displayName ??
    d.establishments.find((e) => e.id === b.establishmentId)?.name ??
    "Reserva"
  );
}

export function bookingTitle(db: DB, b: Booking) {
  return shortName(db, b);
}

/** Avaliação só após interação verificada: reserva concluída, do próprio cliente, uma vez. */
export function canReview(db: DB, bookingId: string, userId: string) {
  const b = db.bookings.find((x) => x.id === bookingId);
  return !!b && b.clientId === userId && b.status === "completed" && !!b.professionalId && !db.reviews.some((r) => r.bookingId === bookingId);
}

export function addReview(bookingId: string, rating: number, text: string) {
  commit((d) => {
    const u = requireUser(d, ["client"]);
    if (!canReview(d, bookingId, u.id)) throw new AppError("Avaliação não permitida para esta reserva.");
    const b = d.bookings.find((x) => x.id === bookingId)!;
    const scan = scanMessage(text);
    d.reviews.unshift({
      id: uid(),
      bookingId,
      authorId: u.id,
      professionalId: b.professionalId!,
      rating: Math.min(5, Math.max(1, Math.round(rating))),
      text: scan.text.slice(0, 600),
      status: scan.risk ? "hidden" : "published",
      createdAt: now(),
    });
    if (scan.risk) autoReport(d, "user", u.id, "Termo de risco em avaliação.");
  });
}

// ───────────────────────── Chat ─────────────────────────

export function openConversation(professionalId: string): string {
  let id = "";
  commit((d) => {
    const u = requireUser(d, ["client"]);
    const pro = d.professionals.find((p) => p.id === professionalId);
    if (!pro || pro.status !== "published") throw new AppError("Perfil indisponível.");
    if (isBlockedBetween(d, u.id, pro.userId)) throw new AppError("Não é possível conversar com este perfil.");
    const existing = d.conversations.find((c) => c.clientId === u.id && c.professionalId === professionalId);
    if (existing) {
      id = existing.id;
      return;
    }
    id = uid();
    d.conversations.unshift({ id, clientId: u.id, professionalId, createdAt: now() });
  });
  return id;
}

export function conversationPeer(db: DB, convId: string, me: User) {
  const c = db.conversations.find((x) => x.id === convId);
  if (!c) return null;
  const pro = db.professionals.find((p) => p.id === c.professionalId);
  const amClient = c.clientId === me.id;
  const amPro = pro?.userId === me.id;
  if (!amClient && !amPro) return null;
  const peerUser = db.users.find((u) => u.id === (amClient ? pro?.userId : c.clientId));
  return {
    conversation: c,
    pro,
    peerUserId: peerUser?.id ?? "deleted",
    name: amClient ? (pro?.displayName ?? "Perfil removido") : (peerUser?.name ?? "Usuário removido"),
    hue: amClient ? (pro?.hue ?? 40) : (peerUser?.hue ?? 40),
    src: amClient && pro ? coverOf(pro) : undefined,
  };
}

export function myConversations(db: DB, me: User) {
  const pro = db.professionals.find((p) => p.userId === me.id);
  return db.conversations
    .filter((c) => c.clientId === me.id || c.professionalId === pro?.id)
    .map((c) => {
      const msgs = db.messages.filter((m) => m.conversationId === c.id);
      return { ...conversationPeer(db, c.id, me)!, last: msgs[msgs.length - 1] };
    })
    .filter((x) => x.peerUserId && !isBlockedBetween(db, me.id, x.peerUserId))
    .sort((a, b) => (b.last?.createdAt ?? b.conversation.createdAt).localeCompare(a.last?.createdAt ?? a.conversation.createdAt));
}

export function sendMessage(convId: string, raw: string) {
  const text = raw.trim();
  if (!text) return { masked: false };
  let masked = false;
  commit((d) => {
    const u = requireUser(d);
    const peer = conversationPeer(d, convId, u);
    if (!peer) throw new AppError("Conversa indisponível.");
    if (isBlockedBetween(d, u.id, peer.peerUserId)) throw new AppError("Conversa bloqueada.");
    const scan = scanMessage(text.slice(0, 1000));
    masked = scan.masked;
    const id = uid();
    d.messages.push({ id, conversationId: convId, senderId: u.id, text: scan.text, masked: scan.masked, flagged: scan.risk, createdAt: now() });
    if (scan.risk) autoReport(d, "message", id, "Termo de risco detectado no chat.");
    notify(d, peer.peerUserId, "Nova mensagem", u.name, `/mensagens/${convId}`);
  });
  return { masked };
}

// ───────────────────────── Denúncias & bloqueios ─────────────────────────

function autoReport(d: DB, targetType: ReportTarget, targetId: string, details: string) {
  d.reports.unshift({
    id: uid(),
    reporterId: "system",
    targetType,
    targetId,
    reason: "Suspeita de menor de idade",
    details: `Denúncia automática: ${details}`,
    priority: "urgent",
    status: "open",
    createdAt: now(),
    automatic: true,
  });
}

export function fileReport(targetType: ReportTarget, targetId: string, reason: string, details: string) {
  commit((d) => {
    const u = requireUser(d);
    d.reports.unshift({
      id: uid(),
      reporterId: u.id,
      targetType,
      targetId,
      reason,
      details: details.slice(0, 1000),
      priority: URGENT_REASONS.has(reason) ? "urgent" : "normal",
      status: "open",
      createdAt: now(),
      automatic: false,
    });
  });
}

export function blockUser(blockedUserId: string) {
  commit((d) => {
    const u = requireUser(d);
    if (!d.blocks.some((b) => b.userId === u.id && b.blockedUserId === blockedUserId))
      d.blocks.push({ userId: u.id, blockedUserId });
  });
}

export function unblockUser(blockedUserId: string) {
  commit((d) => {
    const u = requireUser(d);
    d.blocks = d.blocks.filter((b) => !(b.userId === u.id && b.blockedUserId === blockedUserId));
  });
}

export function markNotificationsRead() {
  commit((d) => {
    const u = requireUser(d);
    d.notifications.forEach((n) => {
      if (n.userId === u.id) n.read = true;
    });
  });
}

// ───────────────────────── Profissional ─────────────────────────

export function myProfessional(db: DB, me: User | null) {
  return me ? (db.professionals.find((p) => p.userId === me.id) ?? null) : null;
}

export function updateMyProfessional(
  patch: Partial<Pick<Professional, "displayName" | "headline" | "bio" | "city" | "region" | "categories" | "kind" | "tags" | "serviceLocations" | "languages" | "priceFrom" | "availability" | "slotMinutes" | "blockedDates">>,
) {
  commit((d) => {
    const u = requireUser(d, ["professional"]);
    const p = d.professionals.find((x) => x.userId === u.id);
    if (!p) throw new AppError("Perfil não encontrado.");
    const scan = scanMessage(`${patch.headline ?? ""} ${patch.bio ?? ""}`);
    if (scan.risk) {
      autoReport(d, "professional", p.id, "Termo de risco na descrição do perfil.");
      throw new AppError("A descrição contém termos não permitidos. Nossa equipe foi notificada.");
    }
    Object.assign(p, patch);
    // Mudanças relevantes num perfil publicado voltam para moderação.
    if (p.status === "published" && (patch.bio !== undefined || patch.headline !== undefined)) {
      audit(d, u.id, "profile.edit", "professional", p.id, "Texto alterado pelo perfil.");
    }
  });
}

export function addPhoto(caption: string) {
  commit((d) => {
    const u = requireUser(d, ["professional"]);
    const p = d.professionals.find((x) => x.userId === u.id)!;
    if (p.photos.length >= 8) throw new AppError("Limite de 8 fotos.");
    p.photos.push({ id: uid(), hue: (p.hue + p.photos.length * 22) % 360, caption: caption || "Foto", status: "pending" });
  });
}

export function removePhoto(photoId: string) {
  commit((d) => {
    const u = requireUser(d, ["professional"]);
    const p = d.professionals.find((x) => x.userId === u.id)!;
    p.photos = p.photos.filter((ph) => ph.id !== photoId);
  });
}

export function submitVerification(input: Omit<VerificationRequest, "id" | "userId" | "professionalId" | "status" | "notes" | "reviewedBy" | "createdAt">) {
  commit((d) => {
    const u = requireUser(d, ["professional"]);
    const p = d.professionals.find((x) => x.userId === u.id)!;
    if (!isAdult(input.birthdate)) throw new AppError("Cadastro profissional permitido apenas para maiores de 18 anos.");
    if (!input.legalName.trim() || !input.documentFile || !input.selfieFile) throw new AppError("Envie documento e selfie.");
    if (!p.headline || !p.bio || p.categories.length === 0) throw new AppError("Complete o perfil (título, descrição e categorias) antes de enviar.");
    if (p.photos.length === 0) throw new AppError("Envie ao menos uma foto.");
    d.verifications = d.verifications.filter((v) => !(v.professionalId === p.id && v.status === "pending"));
    d.verifications.unshift({ ...input, id: uid(), userId: u.id, professionalId: p.id, status: "pending", notes: "", reviewedBy: null, createdAt: now() });
    p.verification = "pending";
    p.status = "pending";
  });
}

export function bookingsForOwner(db: DB, me: User) {
  const p = db.professionals.find((x) => x.userId === me.id);
  const ests = db.establishments.filter((e) => e.ownerId === me.id).map((e) => e.id);
  return db.bookings.filter((b) => (p && b.professionalId === p.id) || (b.establishmentId && ests.includes(b.establishmentId)));
}

// ───────────────────────── Estabelecimentos ─────────────────────────

export function saveEstablishment(input: Omit<Establishment, "id" | "ownerId" | "status" | "hue" | "createdAt" | "photos"> & { id?: string }) {
  let id = input.id ?? "";
  commit((d) => {
    const u = requireUser(d, ["partner"]);
    if (!input.name.trim() || !input.address.trim()) throw new AppError("Informe nome e endereço.");
    if (!input.licenseNumber.trim()) throw new AppError("Informe o número do alvará de funcionamento.");
    if (input.id) {
      const e = d.establishments.find((x) => x.id === input.id && x.ownerId === u.id);
      if (!e) throw new AppError("Estabelecimento não encontrado.");
      const licenseChanged = e.licenseNumber !== input.licenseNumber;
      Object.assign(e, input);
      if (licenseChanged) e.status = "pending";
    } else {
      id = uid();
      d.establishments.push({
        ...input,
        id,
        ownerId: u.id,
        status: "pending",
        hue: Math.floor(Math.random() * 360),
        createdAt: now(),
        photos: [],
      });
    }
  });
  return id;
}

export function addEstablishmentPhoto(establishmentId: string, caption: string) {
  commit((d) => {
    const u = requireUser(d, ["partner"]);
    const e = d.establishments.find((x) => x.id === establishmentId && x.ownerId === u.id);
    if (!e) throw new AppError("Sem permissão.");
    e.photos.push({ id: uid(), hue: (e.hue + e.photos.length * 20) % 360, caption: caption || "Foto", status: "pending" });
  });
}

// ───────────────────────── Planos (receita por assinatura, nunca por encontro) ─────────────────────────

export function isPremium(u: User | null) {
  return !!u && u.plan === "premium" && !!u.planUntil && u.planUntil > now();
}

/** Em demonstração o pagamento é SIMULADO: nenhum valor é cobrado. */
export function subscribePlan(planId: PlanId, method: Payment["method"]) {
  commit((d) => {
    const u = requireUser(d);
    const plan = PLANS[planId];
    if (!plan) throw new AppError("Plano inválido.");
    if (plan.audience !== u.role) throw new AppError("Este plano não está disponível para sua conta.");
    const days = planId === "pro-destaque-7d" ? 7 : 30;
    const user = d.users.find((x) => x.id === u.id)!;
    const base = isPremium(user) ? new Date(user.planUntil!) : new Date();
    user.plan = "premium";
    user.planUntil = new Date(base.getTime() + days * 86400000).toISOString();
    d.payments.unshift({ id: uid(), userId: u.id, planId, amount: plan.price, method, simulated: true, createdAt: now() });
    notify(d, u.id, `${plan.name} ativado`, `Válido até ${new Date(user.planUntil).toLocaleDateString("pt-BR")}.`, "/conta");
  });
}

export function cancelPlan() {
  commit((d) => {
    const u = d.users.find((x) => x.id === requireUser(d).id)!;
    u.plan = "free";
    u.planUntil = null;
  });
}

// ───────────────────────── Administração ─────────────────────────

export function reviewVerification(id: string, approve: boolean, notes: string) {
  commit((d) => {
    const admin = requirePermission(d, "verifications.review");
    const v = d.verifications.find((x) => x.id === id);
    if (!v || v.status !== "pending") throw new AppError("Verificação não está pendente.");
    if (approve && !isAdult(v.birthdate)) throw new AppError("Documento indica menoridade: aprovação bloqueada.");
    v.status = approve ? "approved" : "rejected";
    v.notes = notes;
    v.reviewedBy = admin.id;
    const p = d.professionals.find((x) => x.id === v.professionalId);
    if (p) {
      p.verification = approve ? "verified" : "rejected";
      p.status = approve ? "published" : "draft";
      if (approve) p.photos = p.photos.map((ph) => ({ ...ph, status: "approved" }));
    }
    notify(d, v.userId, approve ? "Identidade verificada" : "Verificação recusada", approve ? "Seu perfil foi publicado." : notes || "Revise os documentos e envie novamente.", "/profissional");
    audit(d, admin.id, approve ? "verification.approve" : "verification.reject", "professional", v.professionalId, notes);
  });
}

export function setReportStatus(id: string, status: "reviewing" | "resolved" | "dismissed", note = "") {
  commit((d) => {
    const admin = requirePermission(d, "reports.moderate");
    const r = d.reports.find((x) => x.id === id);
    if (!r) throw new AppError("Denúncia não encontrada.");
    r.status = status;
    audit(d, admin.id, `report.${status}`, r.targetType, r.targetId, note || r.reason);
  });
}

export function setProfessionalStatus(id: string, status: Professional["status"], reason: string) {
  commit((d) => {
    const admin = requirePermission(d, "reports.moderate");
    const p = d.professionals.find((x) => x.id === id);
    if (!p) throw new AppError("Perfil não encontrado.");
    if (status === "published" && p.verification !== "verified") throw new AppError("Perfil sem identidade verificada não pode ser publicado.");
    p.status = status;
    audit(d, admin.id, `professional.${status}`, "professional", id, reason);
  });
}

export function setPhotoStatus(professionalId: string, photoId: string, status: "approved" | "rejected") {
  commit((d) => {
    const admin = requirePermission(d, "reports.moderate");
    const p = d.professionals.find((x) => x.id === professionalId);
    const ph = p?.photos.find((x) => x.id === photoId);
    if (!ph) throw new AppError("Foto não encontrada.");
    ph.status = status;
    audit(d, admin.id, `photo.${status}`, "photo", photoId, p!.displayName);
  });
}

export function setUserStatus(id: string, status: User["status"], reason: string) {
  commit((d) => {
    const admin = requirePermission(d, "users.manage");
    if (id === admin.id) throw new AppError("Você não pode suspender a própria conta.");
    const u = d.users.find((x) => x.id === id);
    if (!u) throw new AppError("Usuário não encontrado.");
    u.status = status;
    if (status === "suspended") {
      d.professionals.forEach((p) => {
        if (p.userId === id && p.status === "published") p.status = "suspended";
      });
    }
    audit(d, admin.id, `user.${status}`, "user", id, reason);
  });
}

export function setEstablishmentStatus(id: string, status: Establishment["status"], reason: string) {
  commit((d) => {
    const admin = requirePermission(d, "establishments.manage");
    const e = d.establishments.find((x) => x.id === id);
    if (!e) throw new AppError("Estabelecimento não encontrado.");
    e.status = status;
    if (status === "approved") e.photos = e.photos.map((p) => ({ ...p, status: "approved" }));
    notify(d, e.ownerId, `Estabelecimento ${status === "approved" ? "aprovado" : status === "suspended" ? "suspenso" : "em análise"}`, e.name, "/parceiro");
    audit(d, admin.id, `establishment.${status}`, "establishment", id, reason);
  });
}

export function togglePermission(userId: string, perm: AdminPermission) {
  commit((d) => {
    const admin = requirePermission(d, "permissions.manage");
    const target = d.users.find((u) => u.id === userId);
    if (!target || target.role !== "admin") throw new AppError("Permissões só se aplicam a administradores.");
    if (userId === admin.id && perm === "permissions.manage") throw new AppError("Você não pode remover sua própria gestão de permissões.");
    const list = d.adminPermissions[userId] ?? [];
    d.adminPermissions[userId] = list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm];
    audit(d, admin.id, "permission.toggle", "user", userId, perm);
  });
}

export function userName(db: DB, id: string) {
  if (id === "system") return "Sistema PRIVÉ";
  return db.users.find((u) => u.id === id)?.name ?? "Usuário removido";
}
