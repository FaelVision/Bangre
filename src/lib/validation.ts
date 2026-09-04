import { z } from "zod";

export const phoneRegex = /^\+226\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}$/;

export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d]/g, "");
  const local = digits.startsWith("226") ? digits.slice(3) : digits;
  return `+226${local}`;
}

/** Blank strings from optional form fields should read as "not provided", not fail min-length checks. */
const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const optionalPhone = z.preprocess(
  blankToUndefined,
  z.string().trim().min(8, "Numéro de téléphone invalide.").transform(normalizePhone).optional()
);

const optionalEmail = z.preprocess(
  blankToUndefined,
  z.string().trim().toLowerCase().email("Adresse e-mail invalide.").optional()
);

/** A school account is reached by phone, by email, or both — never neither. */
function requireIdentifier(data: { phone?: string; email?: string }, ctx: z.RefinementCtx) {
  if (!data.phone && !data.email) {
    ctx.addIssue({
      code: "custom",
      message: "Indiquez un numéro de téléphone ou une adresse e-mail.",
      path: ["phone"],
    });
  }
}

/** Establishment fields, common to both the password and Google sign-up paths. */
const SchoolDetailsObject = z.object({
  schoolName: z.string().trim().min(2, "Le nom de l'établissement est requis."),
  city: z.string().trim().min(2, "La ville est requise."),
  type: z.string().trim().min(1, "Le type d'établissement est requis."),
  contactName: z.string().trim().min(2, "Le responsable du compte est requis."),
  phone: optionalPhone,
  email: optionalEmail,
});

export const SchoolDetailsSchema = SchoolDetailsObject.superRefine(requireIdentifier);

export const PasswordSchema = z.string().min(8, "8 caractères minimum.");

export const SignupSchema = SchoolDetailsObject.extend({ password: PasswordSchema }).superRefine(requireIdentifier);

/** Sign-in and password-reset both take a single "phone or email" field. */
export const IdentifierSchema = z.string().trim().min(3, "Numéro ou e-mail requis.");

export type ParsedIdentifier = { kind: "phone"; phone: string } | { kind: "email"; email: string };

export function parseIdentifier(raw: string): ParsedIdentifier {
  const trimmed = raw.trim();
  return trimmed.includes("@")
    ? { kind: "email", email: trimmed.toLowerCase() }
    : { kind: "phone", phone: normalizePhone(trimmed) };
}

export const LoginSchema = z.object({
  identifier: IdentifierSchema,
  password: z.string().min(1, "Mot de passe requis."),
});

export const ForgotPasswordSchema = z.object({
  identifier: IdentifierSchema,
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(10, "Lien invalide."),
  password: PasswordSchema,
});
