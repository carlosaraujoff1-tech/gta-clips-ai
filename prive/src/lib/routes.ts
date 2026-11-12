import type { Role } from "./types";

export const HOME_BY_ROLE: Record<Role, string> = {
  client: "/inicio",
  professional: "/profissional",
  partner: "/parceiro",
  admin: "/admin",
};

const AGE_KEY = "prive.age-confirmed";

export function ageConfirmed(): boolean {
  try {
    return localStorage.getItem(AGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function confirmAge() {
  try {
    localStorage.setItem(AGE_KEY, "1");
  } catch {
    /* ignora */
  }
}
