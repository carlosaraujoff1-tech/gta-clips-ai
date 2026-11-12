import type { DB, Professional, User, WeeklySlot } from "./types";
import { isoDate } from "./format";

/** Senha de todas as contas de demonstração: prive2026 */
export const DEMO_PASSWORD = "prive2026";
const PASS = "af5ec922043e1f0031607d9b455e3fb889231cbff40fba15fe86a0a26f598a39";

const now = new Date();
const ago = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();
const inDays = (days: number) => isoDate(new Date(now.getTime() + days * 86400000));

const consent = {
  terms: true,
  privacy: true,
  adultsOnly: true,
  analytics: false,
  marketing: false,
  updatedAt: ago(30),
};

function user(id: string, email: string, name: string, role: User["role"], hue: number, birthdate = "1990-05-10"): User {
  return {
    id,
    email,
    passHash: PASS,
    name,
    role,
    birthdate,
    ageConfirmedAt: ago(60),
    status: "active",
    consent,
    hue,
    createdAt: ago(60),
    discreetMode: false,
    plan: "free",
    planUntil: null,
  };
}

const evenings: WeeklySlot[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "18:00", end: "23:00" }));
const weekend: WeeklySlot[] = [5, 6, 0].map((weekday) => ({ weekday, start: "14:00", end: "22:00" }));
const allWeek: WeeklySlot[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: "12:00", end: "20:00" }));

function pro(
  n: number,
  displayName: string,
  headline: string,
  city: string,
  region: string,
  categories: string[],
  priceFrom: number,
  availability: WeeklySlot[],
  hue: number,
  kind: Professional["kind"] = "Mulheres",
  tags: string[] = ["Discreta", "Atendimento VIP"],
  languages = ["Português", "Inglês"],
): { u: User; p: Professional } {
  const uidv = `u-pro-${n}`;
  return {
    u: user(uidv, `pro${n}@demo.prive`, displayName, "professional", hue, `199${n % 9}-0${(n % 8) + 1}-1${n % 9}`),
    p: {
      id: `p-${n}`,
      userId: uidv,
      displayName,
      headline,
      bio:
        "Perfil independente e verificado. Valorizo conversas inteligentes, discrição absoluta e encontros combinados com antecedência, sempre com respeito mútuo e consentimento.",
      city,
      region,
      kind,
      categories,
      tags,
      serviceLocations: ["Local próprio", "Hotel (reservado pelo cliente)"],
      languages,
      priceFrom,
      verification: "verified",
      status: "published",
      photos: [0, 1, 2, 3, 4, 5].map((i) => ({
        id: `ph-${n}-${i}`,
        hue: (hue + i * 18) % 360,
        caption: ["Retrato", "Ensaio", "Viagem", "Evento", "Noite", "Estúdio"][i],
        status: "approved" as const,
      })),
      availability,
      blockedDates: [],
      slotMinutes: 60,
      hue,
      createdAt: ago(40 - n),
    },
  };
}

export function buildSeed(): DB {
  const pros = [
    pro(1, "Aline Souza", "Elegância para jantares e eventos", "São Paulo", "Jardins", ["Jantares & eventos", "Companhia"], 500, evenings, 28),
    pro(2, "Juliana Prado", "Companhia leve e conversa marcante", "São Paulo", "Itaim Bibi", ["Companhia", "Conversa"], 450, allWeek, 355),
    pro(3, "Rafael Lima", "Parceiro para eventos e viagens", "São Paulo", "Vila Olímpia", ["Viagens", "Jantares & eventos"], 600, weekend, 210, "Homens", ["Discreto", "Bilíngue"], ["Português", "Espanhol"]),
    pro(4, "Helena Duarte", "Massagem relaxante com técnica", "Rio de Janeiro", "Leblon", ["Massagem relaxante"], 380, allWeek, 330),
    pro(5, "Bianca Rocha", "Noites cariocas com estilo", "Rio de Janeiro", "Ipanema", ["Vida noturna", "Companhia"], 520, weekend, 12),
    pro(6, "Lorena Vieira", "Viagens executivas e eventos", "Belo Horizonte", "Savassi", ["Viagens", "Jantares & eventos"], 650, evenings, 40, "Mulheres", ["Discreta", "Bilíngue", "Viagens"], ["Português", "Inglês", "Francês"]),
    pro(7, "Gabriel Torres", "Conversa, cultura e boa mesa", "Curitiba", "Batel", ["Conversa", "Jantares & eventos"], 400, evenings, 190, "Homens", ["Discreto", "Pontual"]),
    pro(8, "Marina Alves", "Discrição e sofisticação", "São Paulo", "Moema", ["Companhia", "Vida noturna"], 550, allWeek, 20),
    pro(11, "Camila Reis", "Sofisticação e boa conversa", "Rio de Janeiro", "Barra da Tijuca", ["Companhia", "Vida noturna"], 480, evenings, 15),
    pro(10, "Clara & Diego", "Casal para eventos e noites especiais", "São Paulo", "Pinheiros", ["Vida noturna", "Jantares & eventos"], 900, weekend, 300, "Casais", ["Discretos", "Atendimento VIP"]),
  ];

  // Fotos de demonstração (autorizadas pelo cliente) — uma por perfil.
  const PHOTO_BY_PROFILE: Record<string, number> = { "p-1": 1, "p-2": 2, "p-4": 3, "p-5": 4, "p-6": 5, "p-11": 6, "p-8": 7, "p-9": 8 };
  const withPhoto = (p: Professional) => {
    const n = PHOTO_BY_PROFILE[p.id];
    if (n) p.photos = [{ id: `ph-${p.id}-real`, src: `/demo/perfil-${n}.webp`, hue: p.hue, caption: "Ensaio", status: p.photos[0]?.status ?? "approved" }];
  };
  pros.forEach((x) => withPhoto(x.p));

  // Um perfil ainda em verificação (aparece em "Verificações pendentes" no admin).
  const pending = pro(9, "Sofia Lima", "Novo perfil em análise", "São Paulo", "Pinheiros", ["Companhia"], 500, evenings, 280);
  pending.p.verification = "pending";
  pending.p.status = "pending";
  pending.p.photos = pending.p.photos.map((ph) => ({ ...ph, status: "pending" }));
  withPhoto(pending.p);

  const users: User[] = [
    user("u-client", "cliente@demo.prive", "Lucas Oliveira", "client", 40),
    user("u-client-2", "andre@demo.prive", "André Martins", "client", 200),
    user("u-partner", "parceiro@demo.prive", "Hotel Aurum", "partner", 42),
    user("u-admin", "admin@demo.prive", "Equipe PRIVÉ", "admin", 45),
    ...pros.map((x) => x.u),
    pending.u,
  ];

  // Histórico de reservas concluídas + avaliações verificadas para cada perfil publicado.
  const REVIEW_TEXTS = [
    "Pontual, educada e extremamente discreta.",
    "Experiência impecável do início ao fim.",
    "Conversa ótima e muito respeito.",
    "Tudo combinado com clareza. Recomendo.",
    "Muito profissional e simpática.",
  ];
  const histBookings: DB["bookings"] = [];
  const histReviews: DB["reviews"] = [];
  pros.forEach(({ p }, i) => {
    const n = 4 + ((i * 7) % 9);
    for (let k = 0; k < n; k++) {
      const id = `hb-${p.id}-${k}`;
      histBookings.push({ id, clientId: "u-client-2", professionalId: p.id, establishmentId: null, date: inDays(-(30 + k * 6)), time: "20:00", durationMin: 60, location: "Local próprio", note: "", status: "completed", createdAt: ago(40 + k * 6), updatedAt: ago(30 + k * 6) });
      histReviews.push({ id: `hr-${p.id}-${k}`, bookingId: id, authorId: "u-client-2", professionalId: p.id, rating: (k + i) % 6 === 0 ? 4 : 5, text: REVIEW_TEXTS[(k + i) % REVIEW_TEXTS.length], status: "published", createdAt: ago(29 + k * 6) });
    }
  });

  return {
    version: 2,
    users,
    professionals: [...pros.map((x) => x.p), pending.p],
    establishments: [
      {
        id: "e-1",
        ownerId: "u-partner",
        name: "Hotel Aurum",
        kind: "Hotel boutique",
        city: "São Paulo",
        region: "Jardins",
        address: "Rua Oscar Freire, 1000 — Jardins",
        description: "Hotel boutique com 42 suítes, entrada discreta, concierge 24h e restaurante autoral.",
        amenities: ["Entrada privativa", "Concierge 24h", "Estacionamento com manobrista", "Room service"],
        photos: [0, 1, 2].map((i) => ({ id: `eph-1-${i}`, hue: 40 + i * 10, caption: ["Fachada", "Suíte", "Lounge"][i], status: "approved" as const })),
        availability: allWeek,
        licenseNumber: "AV-SP-2024-118833",
        status: "approved",
        hue: 40,
        createdAt: ago(50),
      },
      {
        id: "e-2",
        ownerId: "u-partner",
        name: "Noir Lounge",
        kind: "Lounge & bar",
        city: "Rio de Janeiro",
        region: "Leblon",
        address: "Av. Ataulfo de Paiva, 500 — Leblon",
        description: "Lounge intimista com mesas reservadas, carta de drinks autorais e música ao vivo.",
        amenities: ["Mesas reservadas", "Música ao vivo", "Dress code"],
        photos: [0, 1].map((i) => ({ id: `eph-2-${i}`, hue: 15 + i * 12, caption: ["Salão", "Bar"][i], status: "approved" as const })),
        availability: weekend,
        licenseNumber: "AV-RJ-2023-552190",
        status: "approved",
        hue: 15,
        createdAt: ago(45),
      },
      {
        id: "e-3",
        ownerId: "u-partner",
        name: "Spa Sereno",
        kind: "Spa urbano",
        city: "Belo Horizonte",
        region: "Lourdes",
        address: "Rua da Bahia, 2200 — Lourdes",
        description: "Spa urbano com salas privativas, sauna e terapias de relaxamento.",
        amenities: ["Sauna", "Salas privativas", "Chás"],
        photos: [0].map((i) => ({ id: `eph-3-${i}`, hue: 160, caption: "Recepção", status: "pending" as const })),
        availability: allWeek,
        licenseNumber: "AV-MG-2025-004411",
        status: "pending",
        hue: 160,
        createdAt: ago(3),
      },
    ],
    bookings: [
      ...histBookings,
      { id: "b-1", clientId: "u-client", professionalId: "p-1", establishmentId: null, date: inDays(3), time: "20:00", durationMin: 120, location: "Local próprio", note: "Jantar de negócios.", status: "accepted", createdAt: ago(2), updatedAt: ago(1) },
      { id: "b-2", clientId: "u-client", professionalId: "p-2", establishmentId: null, date: inDays(6), time: "15:00", durationMin: 60, location: "A combinar", note: "", status: "requested", createdAt: ago(1), updatedAt: ago(1) },
      { id: "b-3", clientId: "u-client", professionalId: "p-4", establishmentId: null, date: inDays(-10), time: "16:00", durationMin: 60, location: "A combinar", note: "", status: "completed", createdAt: ago(14), updatedAt: ago(10) },
      { id: "b-4", clientId: "u-client-2", professionalId: "p-1", establishmentId: null, date: inDays(2), time: "19:00", durationMin: 60, location: "A combinar", note: "Evento de lançamento.", status: "requested", createdAt: ago(0.2), updatedAt: ago(0.2) },
      { id: "b-5", clientId: "u-client-2", professionalId: "p-1", establishmentId: null, date: inDays(-20), time: "21:00", durationMin: 120, location: "Local próprio", note: "", status: "completed", createdAt: ago(25), updatedAt: ago(20) },
      { id: "b-6", clientId: "u-client", professionalId: null, establishmentId: "e-1", date: inDays(3), time: "19:00", durationMin: 60, location: "A combinar", note: "Mesa no restaurante.", status: "requested", createdAt: ago(1), updatedAt: ago(1) },
    ],
    reviews: [
      ...histReviews,
      { id: "r-1", bookingId: "b-5", authorId: "u-client-2", professionalId: "p-1", rating: 5, text: "Pontual, educada e extremamente discreta. Experiência impecável.", status: "published", createdAt: ago(19) },
      { id: "r-2", bookingId: "b-3", authorId: "u-client", professionalId: "p-4", rating: 5, text: "Ambiente tranquilo e muito profissional.", status: "published", createdAt: ago(9) },
    ],
    favorites: [
      { userId: "u-client", professionalId: "p-1" },
      { userId: "u-client", professionalId: "p-5" },
    ],
    conversations: [{ id: "c-1", clientId: "u-client", professionalId: "p-1", createdAt: ago(2) }],
    messages: [
      { id: "m-1", conversationId: "c-1", senderId: "u-client", text: "Olá, Aline! Enviei uma solicitação para quinta às 20h.", masked: false, flagged: false, createdAt: ago(2) },
      { id: "m-2", conversationId: "c-1", senderId: "u-pro-1", text: "Olá, Lucas! Confirmei pela plataforma. Até lá 🙂", masked: false, flagged: false, createdAt: ago(1.9) },
    ],
    reports: [
      { id: "rep-1", reporterId: "u-client-2", targetType: "professional", targetId: "p-8", reason: "Perfil falso ou fotos não autorizadas", details: "As fotos parecem de outra pessoa.", priority: "normal", status: "open", createdAt: ago(0.5), automatic: false },
      { id: "rep-2", reporterId: "u-admin", targetType: "message", targetId: "m-x", reason: "Suspeita de menor de idade", details: "Denúncia automática: termo de risco detectado no chat.", priority: "urgent", status: "reviewing", createdAt: ago(1), automatic: true },
    ],
    blocks: [],
    verifications: [
      { id: "v-1", userId: "u-pro-9", professionalId: "p-9", legalName: "Sofia A. Lima", documentType: "CNH", documentFile: "cnh-frente-verso.jpg", selfieFile: "selfie-com-documento.jpg", birthdate: "1998-03-14", status: "pending", notes: "", reviewedBy: null, createdAt: ago(1) },
    ],
    notifications: [
      { id: "n-1", userId: "u-client", title: "Reserva confirmada", body: "Aline Souza aceitou sua solicitação.", href: "/reservas", read: false, createdAt: ago(1) },
      { id: "n-2", userId: "u-pro-1", title: "Nova solicitação", body: "André Martins solicitou um horário.", href: "/profissional", read: false, createdAt: ago(0.2) },
    ],
    payments: [],
    audit: [
      { id: "a-1", actorId: "u-admin", action: "verification.approve", targetType: "professional", targetId: "p-1", details: "Documento e selfie conferidos.", createdAt: ago(40) },
    ],
    adminPermissions: {
      "u-admin": ["users.manage", "verifications.review", "reports.moderate", "establishments.manage", "reports.view", "permissions.manage"],
    },
    sessionUserId: null,
  };
}
