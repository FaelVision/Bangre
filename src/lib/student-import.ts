// Reading a list of students the school already has.
//
// Nobody keeps their list in one canonical shape: the columns come in any
// order, the headers are spelled a dozen ways ("Matricule", "N° Mat.", "Nom de
// famille", "Né(e) le"…), Excel exports separate with ";" as often as ",", and
// some lists have no header row at all. So instead of imposing a layout, we
// recognise each column — from its header when there is one, from the values
// themselves otherwise — and let the file stay as it already is.
//
// Pure functions only: the same module runs in the browser to preview what was
// recognised, and on the server to perform the import.

import { frToIso } from "@/lib/date";

export type StudentField =
  | "matricule"
  | "lastName"
  | "firstName"
  | "fullName"
  | "birthDate"
  | "age"
  | "gender"
  | "parentName"
  | "parentPhone";

export const FIELD_LABELS: Record<StudentField, string> = {
  matricule: "Matricule",
  lastName: "Nom",
  firstName: "Prénom",
  fullName: "Nom et prénom",
  birthDate: "Date de naissance",
  age: "Âge",
  gender: "Sexe",
  parentName: "Parent",
  parentPhone: "Téléphone du parent",
};

/** One student read from the file, before any database rule is applied. */
export type ImportRow = {
  /** 1-based line number in the original file, for error messages. */
  line: number;
  matricule: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  age: string;
  gender: string;
  parentName: string;
  parentPhone: string;
};

export type ColumnMatch = {
  field: StudentField;
  index: number;
  /** The header text as written in the file, or "" when detected from the values. */
  header: string;
  /** "header"/"content": recognised automatically. "manual": chosen by the user. */
  how: "header" | "content" | "manual";
};

/** One data row of the file, kept so the user can re-map its columns by hand. */
export type GridRow = { line: number; cells: string[] };

export type ParsedImport = {
  rows: ImportRow[];
  columns: ColumnMatch[];
  delimiter: string;
  /** 1-based line of the header row, or null when the file has none. */
  headerLine: number | null;
  /** Data rows below the header (preamble and repeated headers already removed). */
  dataGrid: GridRow[];
  /** Number of columns — the range the manual mapper offers a choice for. */
  width: number;
  /** The header cells as written, or null when the file has none. */
  headers: string[] | null;
};

// ---------------------------------------------------------------------------
// Header vocabulary
// ---------------------------------------------------------------------------

/** Lowercase, drop accents and every separator: "N° Mat." and "n_matricule" meet here. */
export function normalizeHeader(raw: string): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_ALIASES: Record<StudentField, string[]> = {
  matricule: [
    "matricule", "matricules", "matriculeeleve", "matriculedeleve", "mat", "nmat", "nomat",
    "nmatricule", "nomatricule", "numeromatricule", "nummatricule", "immatriculation",
    "codeeleve", "code", "identifiant", "id", "ine", "numeroine",
  ],
  lastName: [
    "nom", "noms", "nomdefamille", "nomfamille", "nomeleve", "nomdeleve", "nomdelapprenant",
    "patronyme", "lastname", "surname", "familyname",
  ],
  firstName: [
    "prenom", "prenoms", "prenomeleve", "prenomdeleve", "prenomsdeleve", "prenomdelapprenant",
    "firstname", "givenname",
  ],
  fullName: [
    "nometprenom", "nometprenoms", "nomprenom", "nomprenoms", "nomsetprenoms", "nomsprenoms",
    "nomsetprenom", "nomcomplet", "nomcompletdeleve", "nometprenomdeleve", "nometprenomsdeleve",
    "nomsetprenomsdeleve", "identite", "eleve", "eleves", "apprenant", "apprenants", "etudiant",
    "fullname", "name",
  ],
  birthDate: [
    "datedenaissance", "datenaissance", "datedenaiss", "datenaiss", "datenais", "dtnaissance",
    "ddn", "dn", "naissance", "nele", "neele", "neelle", "dateofbirth", "birthdate", "dob",
    "datedenaissancedeleve",
  ],
  age: ["age", "ages", "agedeleve", "agerevolu"],
  gender: ["sexe", "sexes", "genre", "sex", "gender", "mf", "sexemf", "garconfille"],
  parentName: [
    "parent", "parents", "nomduparent", "nomparent", "nomdesparents", "tuteur", "nomtuteur",
    "nomdututeur", "responsable", "nomduresponsable", "pere", "mere", "peremere",
  ],
  parentPhone: [
    "numeroparent", "numerodeparent", "numeroduparent", "numerodesparents", "nparent", "noparent",
    "telephone", "telephones", "tel", "telparent", "telephoneparent", "telephoneduparent",
    "telephonedesparents", "teltuteur", "contact", "contacts", "contactparent", "numerotelephone",
    "numerodetelephone", "numtel", "ntel", "notel", "numero", "numeros", "phone", "telephonenumber",
    "whatsapp", "numerowhatsapp", "portable", "cellulaire", "cel", "mobile", "gsm",
  ],
};

/** Columns we recognise well enough to know they carry nothing we import. */
const IGNORED_HEADERS = new Set([
  "n", "no", "num", "ndordre", "nordre", "numerodordre", "ordre", "rang", "rangs", "index",
  "observation", "observations", "remarque", "remarques", "statut", "situation",
  "classe", "classes", "class", "niveau", "section", "serie", "groupe",
  "ecole", "etablissement", "annee", "anneescolaire", "photo",
  "montant", "scolarite", "total", "paye", "reste", "solde", "frais",
]);

const HEADER_LOOKUP = new Map<string, StudentField>();
for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [StudentField, string[]][]) {
  for (const alias of aliases) if (!HEADER_LOOKUP.has(alias)) HEADER_LOOKUP.set(alias, field);
}

// ---------------------------------------------------------------------------
// Value shapes, used to recognise unlabelled columns
// ---------------------------------------------------------------------------

export function looksLikePhone(value: string): boolean {
  const v = value.trim();
  // "/" is allowed — families often give two numbers in one cell — but that
  // also makes "26/11/2006" look like a phone number, so dates win.
  if (!/^[+(]?\d[\d\s.\-()/]*$/.test(v) || looksLikeDate(v)) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function looksLikeDate(value: string): boolean {
  return frToIso(value) !== "";
}

function looksLikeAge(value: string): boolean {
  const v = value.trim();
  if (!/^\d{1,2}$/.test(v)) return false;
  const n = Number(v);
  return n >= 2 && n <= 40;
}

function looksLikeMatricule(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && v.length <= 20 && /\d/.test(v) && !looksLikePhone(v) && !looksLikeDate(v);
}

function looksLikeName(value: string): boolean {
  return /[a-zà-ÿ]{2,}/i.test(value) && !/\d/.test(value);
}

/** "M", "F" or "" — accepts Masculin/Féminin, Garçon/Fille, H/F, M/F. */
export function normalizeGender(raw: string): string {
  const v = normalizeHeader(raw);
  if (["m", "h", "masculin", "male", "homme", "garcon", "g"].includes(v)) return "M";
  if (["f", "feminin", "female", "femme", "fille"].includes(v)) return "F";
  return "";
}

/** Share of the non-empty values that match — the basis of every content guess. */
function share(values: string[], predicate: (v: string) => boolean): number {
  const filled = values.filter((v) => v.trim().length > 0);
  if (filled.length === 0) return 0;
  return filled.filter(predicate).length / filled.length;
}

// ---------------------------------------------------------------------------
// CSV reading
// ---------------------------------------------------------------------------

/** Split one line, honouring "quoted, fields" and doubled "" escapes. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      cells.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

const DELIMITERS = [",", ";", "\t", "|"];

/** The separator that carves the file into the most consistent grid. */
export function detectDelimiter(lines: string[]): string {
  let best = ",";
  let bestScore = 0;

  for (const delimiter of DELIMITERS) {
    const counts = lines.slice(0, 20).map((l) => splitCsvLine(l, delimiter).length);
    const candidates = counts.filter((c) => c > 1);
    if (candidates.length === 0) continue;
    const modal = candidates.reduce((a, b) =>
      counts.filter((c) => c === b).length > counts.filter((c) => c === a).length ? b : a
    );
    const score = counts.filter((c) => c === modal).length * modal;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/** A header row names its columns; a data row carries dates, phone numbers, digits. */
function headerScore(cells: string[]): number {
  let recognised = 0;
  for (const cell of cells) {
    const key = normalizeHeader(cell);
    if (cell.trim() && (looksLikeDate(cell) || looksLikePhone(cell))) return 0;
    if (key !== "" && (HEADER_LOOKUP.has(key) || IGNORED_HEADERS.has(key))) recognised += 1;
  }
  return recognised;
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

/** Fields we try to recognise from the values, most distinctive shape first. */
const CONTENT_GUESSES: { field: StudentField; test: (v: string) => boolean; threshold: number }[] = [
  { field: "birthDate", test: looksLikeDate, threshold: 0.6 },
  { field: "parentPhone", test: looksLikePhone, threshold: 0.6 },
  { field: "gender", test: (v) => normalizeGender(v) !== "", threshold: 0.8 },
  { field: "age", test: looksLikeAge, threshold: 0.8 },
  { field: "matricule", test: looksLikeMatricule, threshold: 0.7 },
];

function mapColumns(header: string[] | null, dataRows: string[][], width: number): ColumnMatch[] {
  const taken = new Map<StudentField, ColumnMatch>();
  const skipped = new Set<number>();
  const columnValues = (index: number) => dataRows.map((r) => r[index] ?? "");
  const isUsed = (index: number) => [...taken.values()].some((c) => c.index === index);
  const matchAt = (field: StudentField, index: number, how: ColumnMatch["how"]): ColumnMatch => ({
    field,
    index,
    header: header ? (header[index] ?? "").trim() : "",
    how,
  });

  // 1. Whatever the header names — as long as the values do not contradict it.
  if (header) {
    for (let i = 0; i < width; i += 1) {
      const key = normalizeHeader(header[i] ?? "");
      const field = HEADER_LOOKUP.get(key);
      if (!field) {
        if (key === "" || IGNORED_HEADERS.has(key)) skipped.add(i);
        continue;
      }
      if (taken.has(field)) continue;

      // "Numéro" is a phone number in one list and the row index in the next;
      // the values settle it. Same for a date column full of something else.
      const values = columnValues(i);
      if (field === "parentPhone" && share(values, looksLikePhone) < 0.3) continue;
      if (field === "birthDate" && share(values, looksLikeDate) < 0.3) continue;

      taken.set(field, matchAt(field, i, "header"));
    }
  }

  // 2. Unlabelled columns: recognise them by what they contain.
  for (const { field, test, threshold } of CONTENT_GUESSES) {
    if (taken.has(field)) continue;
    for (let i = 0; i < width; i += 1) {
      if (isUsed(i) || skipped.has(i)) continue;
      if (share(columnValues(i), test) >= threshold) {
        taken.set(field, matchAt(field, i, "content"));
        break;
      }
    }
  }

  // 3. Names last: any leftover column of letters. Two of them read as
  //    "nom" then "prénom" — the order every school list uses.
  if (!taken.has("lastName") && !taken.has("fullName")) {
    const nameColumns: number[] = [];
    for (let i = 0; i < width; i += 1) {
      if (isUsed(i) || skipped.has(i)) continue;
      if (share(columnValues(i), looksLikeName) >= 0.7) nameColumns.push(i);
    }
    if (nameColumns.length >= 2 && !taken.has("firstName")) {
      taken.set("lastName", matchAt("lastName", nameColumns[0], "content"));
      taken.set("firstName", matchAt("firstName", nameColumns[1], "content"));
    } else if (nameColumns.length >= 1) {
      const field: StudentField = taken.has("firstName") ? "lastName" : "fullName";
      taken.set(field, matchAt(field, nameColumns[0], "content"));
    }
  }

  // 4. A lone "Nom" column, with no "Prénom" beside it, holds both.
  if (taken.has("lastName") && !taken.has("firstName") && !taken.has("fullName")) {
    const lastName = taken.get("lastName")!;
    taken.delete("lastName");
    taken.set("fullName", { ...lastName, field: "fullName" });
  }
  // ...and a "Nom et prénom" next to a "Prénom" column is really just the name.
  if (taken.has("fullName") && taken.has("firstName") && !taken.has("lastName")) {
    const fullName = taken.get("fullName")!;
    taken.delete("fullName");
    taken.set("lastName", { ...fullName, field: "lastName" });
  }

  return [...taken.values()].sort((a, b) => a.index - b.index);
}

/**
 * Split "OUEDRAOGO Ali Bertrand" into a family name and the rest. Lists here
 * write the family name in capitals when both share one cell; failing that,
 * the first word is the family name.
 */
export function splitFullName(raw: string): { lastName: string; firstName: string } {
  const value = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return { lastName: "", firstName: "" };

  const comma = value.indexOf(",");
  if (comma > 0) {
    return { lastName: value.slice(0, comma).trim(), firstName: value.slice(comma + 1).trim() };
  }

  const words = value.split(" ");
  if (words.length === 1) return { lastName: words[0], firstName: "" };

  const isCaps = (w: string) => w === w.toUpperCase() && /[A-ZÀ-Þ]/.test(w);
  if (words.some(isCaps) && !words.every(isCaps)) {
    return {
      lastName: words.filter(isCaps).join(" "),
      firstName: words.filter((w) => !isCaps(w)).join(" "),
    };
  }
  return { lastName: words[0], firstName: words.slice(1).join(" ") };
}

// ---------------------------------------------------------------------------
// Row building — shared by the automatic parse and the manual re-mapping
// ---------------------------------------------------------------------------

/** Read one field's value out of a row, following the given column mapping. */
function readField(cells: string[], columns: ColumnMatch[], field: StudentField): string {
  const match = columns.find((c) => c.field === field);
  return match ? (cells[match.index] ?? "").trim() : "";
}

/** Turn the data rows into {@link ImportRow}s using an explicit column mapping. */
export function rowsFromColumns(dataGrid: GridRow[], columns: ColumnMatch[]): ImportRow[] {
  const rows: ImportRow[] = [];
  for (const { line, cells } of dataGrid) {
    if (cells.every((c) => c.trim() === "")) continue;

    let lastName = readField(cells, columns, "lastName");
    let firstName = readField(cells, columns, "firstName");
    const full = readField(cells, columns, "fullName");
    if (full) {
      const split = splitFullName(full);
      lastName = lastName || split.lastName;
      firstName = firstName || split.firstName;
    }

    rows.push({
      line,
      matricule: readField(cells, columns, "matricule"),
      lastName,
      firstName,
      birthDate: readField(cells, columns, "birthDate"),
      age: readField(cells, columns, "age"),
      gender: normalizeGender(readField(cells, columns, "gender")),
      parentName: readField(cells, columns, "parentName"),
      parentPhone: readField(cells, columns, "parentPhone"),
    });
  }
  return rows;
}

/**
 * Build a column mapping from the user's choices in the correspondence grid:
 * `{ [columnIndex]: field }`, an empty/absent value meaning "ignore this column".
 */
export function columnsFromMapping(
  mapping: Record<number, StudentField | "">,
  headers: string[] | null
): ColumnMatch[] {
  const columns: ColumnMatch[] = [];
  for (const [key, field] of Object.entries(mapping)) {
    const index = Number(key);
    if (!field || !Number.isInteger(index) || index < 0) continue;
    columns.push({
      field,
      index,
      header: headers ? (headers[index] ?? "").trim() : "",
      how: "manual",
    });
  }
  return columns.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

const emptyImport = (): ParsedImport => ({
  rows: [], columns: [], delimiter: ",", headerLine: null, dataGrid: [], width: 0, headers: null,
});

/** Recognise columns and read students out of an already-split grid of cells. */
function parseGrid(grid: GridRow[], delimiter: string): ParsedImport {
  if (grid.length === 0) return emptyImport();
  const width = Math.max(...grid.map((r) => r.cells.length));

  // The header is not always the first line — a title row ("LISTE DES ÉLÈVES
  // — 6e A") often sits above it. Take the best-scoring row of the first ten.
  let headerIndex = -1;
  let bestScore = 1;
  for (let i = 0; i < Math.min(grid.length, 10); i += 1) {
    const score = headerScore(grid[i].cells);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  }

  const headers = headerIndex >= 0 ? grid[headerIndex].cells : null;
  // Everything above the header is preamble; a header repeated further down
  // (one page per class) is not a student either.
  const dataGrid = grid.slice(headerIndex + 1).filter((r) => headerScore(r.cells) < 2);
  const columns = mapColumns(headers, dataGrid.map((r) => r.cells), width);
  const rows = rowsFromColumns(dataGrid, columns);

  return {
    rows,
    columns,
    delimiter,
    headerLine: headerIndex >= 0 ? grid[headerIndex].line : null,
    dataGrid,
    width,
    headers,
  };
}

/** Read a CSV / TSV / semicolon-separated file the school already keeps. */
export function parseStudentsFile(text: string): ParsedImport {
  const rawLines = text.replace(/^﻿/, "").split(/\r?\n/);
  const lines: { line: number; text: string }[] = [];
  rawLines.forEach((t, i) => {
    if (/[^\s,;|]/.test(t)) lines.push({ line: i + 1, text: t });
  });
  if (lines.length === 0) return emptyImport();

  const delimiter = detectDelimiter(lines.map((l) => l.text));
  const grid = lines.map((l) => ({ line: l.line, cells: splitCsvLine(l.text, delimiter) }));
  return parseGrid(grid, delimiter);
}

/** Read an already-tabular source (an .xlsx worksheet read by `xlsxToRows`). */
export function parseStudentsRows(rows: string[][]): ParsedImport {
  const grid: GridRow[] = [];
  rows.forEach((cells, i) => {
    const trimmed = cells.map((c) => (c ?? "").trim());
    if (trimmed.some((c) => c !== "")) grid.push({ line: i + 1, cells: trimmed });
  });
  return parseGrid(grid, ",");
}
