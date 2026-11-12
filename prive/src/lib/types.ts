export type Role = "client" | "professional" | "partner" | "admin";

export interface Consent {
  terms: boolean;
  privacy: boolean;
  adultsOnly: boolean;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  passHash: string;
  name: string;
  role: Role;
  birthdate: string; // YYYY-MM-DD
  ageConfirmedAt: string;
  status: "active" | "suspended";
  consent: Consent;
  hue: number;
  createdAt: string;
  discreetMode: boolean;
}

export type Verification = "none" | "pending" | "verified" | "rejected";

export interface Photo {
  id: string;
  hue: number;
  caption: string;
  status: "pending" | "approved" | "rejected";
}

export interface WeeklySlot {
  weekday: number; // 0 = domingo
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface Professional {
  id: string;
  userId: string;
  displayName: string;
  headline: string;
  bio: string;
  city: string;
  region: string;
  categories: string[];
  languages: string[];
  priceFrom: number | null;
  verification: Verification;
  status: "draft" | "pending" | "published" | "suspended";
  photos: Photo[];
  availability: WeeklySlot[];
  blockedDates: string[];
  slotMinutes: number;
  hue: number;
  createdAt: string;
}

export interface Establishment {
  id: string;
  ownerId: string;
  name: string;
  kind: string;
  city: string;
  region: string;
  address: string;
  description: string;
  amenities: string[];
  photos: Photo[];
  availability: WeeklySlot[];
  licenseNumber: string;
  status: "pending" | "approved" | "suspended";
  hue: number;
  createdAt: string;
}

export type BookingStatus = "requested" | "accepted" | "declined" | "cancelled" | "completed";

export interface Booking {
  id: string;
  clientId: string;
  professionalId: string | null;
  establishmentId: string | null;
  date: string;
  time: string;
  durationMin: number;
  note: string;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  bookingId: string;
  authorId: string;
  professionalId: string;
  rating: number;
  text: string;
  status: "published" | "hidden";
  createdAt: string;
}

export interface Conversation {
  id: string;
  clientId: string;
  professionalId: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  masked: boolean;
  flagged: boolean;
  createdAt: string;
}

export type ReportTarget = "professional" | "user" | "message" | "establishment";

export interface Report {
  id: string;
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  reason: string;
  details: string;
  priority: "normal" | "urgent";
  status: "open" | "reviewing" | "resolved" | "dismissed";
  createdAt: string;
  automatic: boolean;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  professionalId: string;
  legalName: string;
  documentType: "RG" | "CNH" | "Passaporte";
  documentFile: string;
  selfieFile: string;
  birthdate: string;
  status: "pending" | "approved" | "rejected";
  notes: string;
  reviewedBy: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface DB {
  version: number;
  users: User[];
  professionals: Professional[];
  establishments: Establishment[];
  bookings: Booking[];
  reviews: Review[];
  favorites: { userId: string; professionalId: string }[];
  conversations: Conversation[];
  messages: Message[];
  reports: Report[];
  blocks: { userId: string; blockedUserId: string }[];
  verifications: VerificationRequest[];
  notifications: Notification[];
  audit: AuditLog[];
  adminPermissions: Record<string, AdminPermission[]>;
  sessionUserId: string | null;
}

export type AdminPermission =
  | "users.manage"
  | "verifications.review"
  | "reports.moderate"
  | "establishments.manage"
  | "reports.view"
  | "permissions.manage";
