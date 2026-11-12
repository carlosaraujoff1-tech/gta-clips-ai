/**
 * Feature flags de conformidade. Itens comerciais ficam DESLIGADOS até
 * validação jurídica e aprovação expressa dos fornecedores (ver docs/ARQUITETURA.md §8).
 */
export const FEATURES = {
  payments: false,
  commissions: false,
  /** Faixa de preço apenas informativa (sem transação na plataforma). */
  priceInfo: true,
  /** Chat só é liberado após solicitação de reserva aceita. */
  chatRequiresAcceptedBooking: false,
} as const;

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const DEMO_MODE = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const CATEGORIES = [
  "Jantares & eventos",
  "Companhia",
  "Viagens",
  "Massagem relaxante",
  "Vida noturna",
  "Conversa",
] as const;

export const CITIES: Record<string, string[]> = {
  "São Paulo": ["Jardins", "Itaim Bibi", "Moema", "Vila Olímpia", "Pinheiros"],
  "Rio de Janeiro": ["Leblon", "Ipanema", "Barra da Tijuca", "Botafogo"],
  "Belo Horizonte": ["Savassi", "Lourdes", "Funcionários"],
  Curitiba: ["Batel", "Água Verde"],
};

export const REPORT_REASONS = [
  "Suspeita de menor de idade",
  "Suspeita de exploração, coerção ou tráfico",
  "Perfil falso ou fotos não autorizadas",
  "Assédio ou comportamento abusivo",
  "Golpe ou fraude",
  "Conteúdo impróprio",
  "Outro",
] as const;

export const URGENT_REASONS = new Set<string>([REPORT_REASONS[0], REPORT_REASONS[1]]);
