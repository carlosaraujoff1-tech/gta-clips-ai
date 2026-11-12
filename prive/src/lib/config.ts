/**
 * Feature flags de conformidade. Itens comerciais ficam DESLIGADOS até
 * validação jurídica e aprovação expressa dos fornecedores (ver docs/ARQUITETURA.md §8).
 */
export const FEATURES = {
  /** Pagamento de encontros/reservas: proibido (intermediação). Nunca ligar. */
  payments: false,
  /** Cobrança de planos/destaques. Em demonstração o checkout é simulado. */
  subscriptions: true,
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

export const KINDS = ["Mulheres", "Homens", "Casais"] as const;

export const TAGS = ["Discreta", "Discreto", "Atendimento VIP", "Bilíngue", "Pontual", "Eventos", "Viagens"] as const;

/** Onde o perfil atende: informação declarada pelo próprio perfil, sem intermediação de local. */
export const SERVICE_LOCATIONS = ["Local próprio", "Hotel (reservado pelo cliente)", "A combinar"] as const;

/**
 * Planos pagos: a receita vem de assinatura/visibilidade, nunca de encontros.
 * (ver docs/ARQUITETURA.md §7)
 */
export const PLANS = {
  "cliente-premium": {
    audience: "client",
    name: "Cliente Premium",
    price: 39.9,
    period: "mês",
    perks: ["Filtros avançados e favoritos ilimitados", "Selo Cliente Premium", "Modo discreto completo", "Suporte prioritário"],
  },
  "pro-premium": {
    audience: "professional",
    name: "Perfil Premium",
    price: 99,
    period: "mês",
    perks: ["Até 10 fotos", "Melhor posição na busca", "Estatísticas de visitas", "Selo Premium no card"],
  },
  "pro-destaque-7d": {
    audience: "professional",
    name: "Destaque 7 dias",
    price: 49.9,
    period: "7 dias",
    perks: ["Topo da busca na sua cidade", "Aparece em “Em destaque” na página inicial"],
  },
} as const;
export type PlanId = keyof typeof PLANS;

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
