/**
 * Client form validation (Feature 19), mirroring the backend F04 contract.
 *
 * The rules are exactly the ones the API enforces
 * (`CreateClientRequest` / `UpdateClientRequest`): name and phone1 required,
 * name 200 / phones 30 / email 255 / notes 2000 characters, email optional and
 * not unique. Nothing is invented here: the form only prevents a request the
 * backend would reject, the backend stays the authority.
 */

export const CLIENT_LIMITS = {
  name: 200,
  phone: 30,
  email: 255,
  notes: 2000,
} as const;

export interface ClientFormValues {
  name: string;
  phone1: string;
  phone2: string;
  email: string;
  notes: string;
}

export type ClientField = keyof ClientFormValues;

export type ClientFormErrors = Partial<Record<ClientField, string>>;

/** Body accepted by `POST /api/clients` and `PUT /api/clients/{id}`. */
export interface ClientPayload {
  name: string;
  phone1: string;
  phone2: string | null;
  email: string | null;
  notes: string | null;
}

export const EMPTY_CLIENT_FORM: ClientFormValues = {
  name: "",
  phone1: "",
  phone2: "",
  email: "",
  notes: "",
};

// Same shape the backend's @Email accepts for the common cases.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimmed(value: string): string {
  return value.trim();
}

function emptyToNull(value: string): string | null {
  const result = trimmed(value);
  return result.length === 0 ? null : result;
}

/** Builds the form state from an existing client (edit screen). */
export function clientToFormValues(client: {
  name: string;
  phone1: string;
  phone2: string | null;
  email: string | null;
  notes: string | null;
}): ClientFormValues {
  return {
    name: client.name,
    phone1: client.phone1,
    phone2: client.phone2 ?? "",
    email: client.email ?? "",
    notes: client.notes ?? "",
  };
}

export interface ClientValidationResult {
  errors: ClientFormErrors;
  /** Normalized payload, or `null` while at least one field is invalid. */
  payload: ClientPayload | null;
}

export function validateClient(values: ClientFormValues): ClientValidationResult {
  const errors: ClientFormErrors = {};

  const name = trimmed(values.name);
  if (name.length === 0) {
    errors.name = "Le nom est obligatoire.";
  } else if (name.length > CLIENT_LIMITS.name) {
    errors.name = `Le nom ne peut pas dépasser ${CLIENT_LIMITS.name} caractères.`;
  }

  const phone1 = trimmed(values.phone1);
  if (phone1.length === 0) {
    errors.phone1 = "Le téléphone principal est obligatoire.";
  } else if (phone1.length > CLIENT_LIMITS.phone) {
    errors.phone1 = `Le téléphone principal ne peut pas dépasser ${CLIENT_LIMITS.phone} caractères.`;
  }

  // phone2 is optional; whitespace-only means "not provided" (the backend
  // rejects a blank non-null value, so it is sent as null).
  const phone2 = emptyToNull(values.phone2);
  if (phone2 !== null && phone2.length > CLIENT_LIMITS.phone) {
    errors.phone2 = `Le téléphone secondaire ne peut pas dépasser ${CLIENT_LIMITS.phone} caractères.`;
  }

  const email = emptyToNull(values.email);
  if (email !== null) {
    if (email.length > CLIENT_LIMITS.email) {
      errors.email = `L'adresse email ne peut pas dépasser ${CLIENT_LIMITS.email} caractères.`;
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.email = "L'adresse email n'est pas valide.";
    }
  }

  const notes = emptyToNull(values.notes);
  if (notes !== null && notes.length > CLIENT_LIMITS.notes) {
    errors.notes = `Les notes ne peuvent pas dépasser ${CLIENT_LIMITS.notes.toLocaleString("fr-FR")} caractères.`;
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null };
  }

  return {
    errors,
    payload: { name, phone1, phone2, email, notes },
  };
}
