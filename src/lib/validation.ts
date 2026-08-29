import { z } from "zod";

export const phoneRegex = /^\+226\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}$/;

export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d]/g, "");
  const local = digits.startsWith("226") ? digits.slice(3) : digits;
  return `+226${local}`;
}

export const SignupSchema = z.object({
  schoolName: z.string().trim().min(2, "Le nom de l'établissement est requis."),
  city: z.string().trim().min(2, "La ville est requise."),
  type: z.string().trim().min(1, "Le type d'établissement est requis."),
  contactName: z.string().trim().min(2, "Le responsable du compte est requis."),
  phone: z
    .string()
    .trim()
    .min(8, "Numéro de téléphone invalide.")
    .transform(normalizePhone),
  password: z.string().min(8, "8 caractères minimum."),
});

export const LoginSchema = z.object({
  phone: z.string().trim().min(8, "Numéro de téléphone invalide.").transform(normalizePhone),
  password: z.string().min(1, "Mot de passe requis."),
});
