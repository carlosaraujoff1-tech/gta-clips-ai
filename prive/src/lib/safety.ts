/** Regras de segurança executadas no cliente E replicadas no banco (ver supabase/migrations). */

export function ageFrom(birthdate: string, today = new Date()): number {
  const [y, m, d] = birthdate.split("-").map(Number);
  if (!y || !m || !d) return 0;
  let age = today.getFullYear() - y;
  const beforeBirthday = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export const isAdult = (birthdate: string) => ageFrom(birthdate) >= 18;

/**
 * Termos que indicam risco de envolvimento de menores, coerção ou tráfico.
 * Qualquer ocorrência gera denúncia automática URGENTE para a moderação.
 */
const RISK_PATTERNS: RegExp[] = [
  /\bmenor(es)?\b/i,
  /\bnovinh[ao]s?\b/i,
  /\bcolegial\b/i,
  /\b(1[0-7]|[1-9])\s*anos\b/i,
  /\bad?olescente/i,
  /\bpassaporte (dela|retido)\b/i,
  /\bobrigad[ao] a\b/i,
  /\bd[ií]vida com o dono\b/i,
];

const PHONE = /(\+?55\s?)?(\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PIX = /\b(pix|chave pix)\b[^\n]*/gi;
const LINK = /\bhttps?:\/\/\S+/gi;

export interface ScanResult {
  text: string;
  masked: boolean;
  risk: boolean;
}

/** Mascara dados de contato/pagamento (proteção contra golpes e aliciamento fora da plataforma). */
export function scanMessage(raw: string): ScanResult {
  const risk = RISK_PATTERNS.some((p) => p.test(raw));
  let text = raw;
  for (const re of [EMAIL, PIX, LINK, PHONE]) text = text.replace(re, "•••• oculto ••••");
  return { text, masked: text !== raw, risk };
}

export function hasRiskTerms(raw: string): boolean {
  return RISK_PATTERNS.some((p) => p.test(raw));
}

export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`prive:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function passwordIssues(p: string): string | null {
  if (p.length < 8) return "A senha precisa de pelo menos 8 caracteres.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Use letras e números.";
  return null;
}
