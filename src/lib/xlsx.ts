// Reading a real .xlsx workbook — the file a school exports from Excel, without
// asking anyone to "Save as CSV" first.
//
// An .xlsx is a ZIP of XML parts. We unzip with fflate (already a dependency of
// @react-pdf/renderer, and it runs in the browser too, so the same code previews
// the file client-side and imports it server-side) and read just enough of the
// first worksheet to hand back a plain string grid — exactly the shape
// `student-import.ts` already knows how to recognise.
//
// Deliberately narrow: first sheet only, shared/inline strings, numbers, and
// date-formatted numbers (converted to jj/mm/aaaa). Password-protected or legacy
// .xls files are not supported — the caller catches the throw and tells the user
// to send a CSV instead.

import { unzipSync, strFromU8 } from "fflate";

/** Read the first worksheet of an .xlsx file as a grid of trimmed cell strings. */
export function xlsxToRows(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("Fichier Excel illisible.");
  }

  const read = (path: string): string | null => {
    const entry = files[path] ?? files[path.replace(/^\//, "")];
    return entry ? strFromU8(entry) : null;
  };

  const workbook = read("xl/workbook.xml");
  if (!workbook) throw new Error("Ce fichier n'est pas un classeur Excel (.xlsx) valide.");

  const sheetPath = firstSheetPath(workbook, read("xl/_rels/workbook.xml.rels"), files);
  const sheetXml = read(sheetPath);
  if (!sheetXml) throw new Error("Feuille de calcul introuvable dans le fichier.");

  const sharedStrings = parseSharedStrings(read("xl/sharedStrings.xml"));
  const dateStyles = parseDateStyles(read("xl/styles.xml"));

  return parseSheet(sheetXml, sharedStrings, dateStyles);
}

// ---------------------------------------------------------------------------
// XML helpers — a scan, not a DOM. Enough for the parts Excel actually writes.
// ---------------------------------------------------------------------------

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** "A" → 0, "Z" → 25, "AA" → 26 … from a cell reference like "AB12". */
function columnIndex(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/)?.[0] ?? "";
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

// ---------------------------------------------------------------------------
// Workbook → first worksheet part
// ---------------------------------------------------------------------------

function firstSheetPath(
  workbookXml: string,
  relsXml: string | null,
  files: Record<string, Uint8Array>
): string {
  const sheetTag = workbookXml.match(/<sheet\b[^>]*>/)?.[0] ?? "";
  const relId = attr(sheetTag, "r:id");

  if (relId && relsXml) {
    const relTag = relsXml
      .match(/<Relationship\b[^>]*>/g)
      ?.find((t) => attr(t, "Id") === relId);
    const target = relTag && attr(relTag, "Target");
    if (target) {
      const path = target.startsWith("/")
        ? target.slice(1)
        : `xl/${target.replace(/^\.\//, "")}`;
      if (files[path]) return path;
    }
  }

  // No usable relationship — fall back to the conventional location.
  const guess = Object.keys(files).find((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));
  return guess ?? "xl/worksheets/sheet1.xml";
}

// ---------------------------------------------------------------------------
// Shared strings
// ---------------------------------------------------------------------------

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const items = xml.match(/<si\b[^>]*>[\s\S]*?<\/si>|<si\b[^>]*\/>/g) ?? [];
  return items.map((si) => {
    const parts = si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    return parts
      .map((t) => unescapeXml(t.replace(/^<t\b[^>]*>/, "").replace(/<\/t>$/, "")))
      .join("");
  });
}

// ---------------------------------------------------------------------------
// Styles → which style indexes are a date format
// ---------------------------------------------------------------------------

/** Builtin numFmtId values Excel reserves for dates and times. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function parseDateStyles(xml: string | null): Set<number> {
  const dateStyleIndexes = new Set<number>();
  if (!xml) return dateStyleIndexes;

  // Custom formats: a date if the code carries a day or year token once the
  // literal (quoted, bracketed or backslash-escaped) pieces are stripped.
  const customDateIds = new Set<number>();
  for (const tag of xml.match(/<numFmt\b[^>]*\/?>/g) ?? []) {
    const id = Number(attr(tag, "numFmtId"));
    const code = (attr(tag, "formatCode") ?? "").replace(/\[[^\]]*\]|"[^"]*"|\\./g, "");
    if (Number.isFinite(id) && /[dy]/i.test(code)) customDateIds.add(id);
  }

  const cellXfs = xml.match(/<cellXfs\b[^>]*>[\s\S]*?<\/cellXfs>/)?.[0] ?? "";
  const xfs = cellXfs.match(/<xf\b[^>]*>/g) ?? [];
  xfs.forEach((xf, styleIndex) => {
    const numFmtId = Number(attr(xf, "numFmtId") ?? "0");
    if (BUILTIN_DATE_FORMATS.has(numFmtId) || customDateIds.has(numFmtId)) {
      dateStyleIndexes.add(styleIndex);
    }
  });
  return dateStyleIndexes;
}

// ---------------------------------------------------------------------------
// Serial number → date
// ---------------------------------------------------------------------------

// Excel's day 0 is 1899-12-31 and it wrongly counts 1900 as a leap year, so for
// every date we care about (well after 1900-03-01) the epoch is 1899-12-30.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function serialToFrDate(serial: number): string {
  const date = new Date(EXCEL_EPOCH + Math.round(serial) * 86_400_000);
  if (Number.isNaN(date.getTime())) return String(serial);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// Worksheet → grid
// ---------------------------------------------------------------------------

function parseSheet(xml: string, sharedStrings: string[], dateStyles: Set<number>): string[][] {
  const body = xml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/)?.[1] ?? "";
  const rowMatches = body.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];

  const grid: string[][] = [];
  let width = 0;

  for (const rowXml of rowMatches) {
    const rowNumber = Number(attr(rowXml.match(/<row\b[^>]*>/)?.[0] ?? "", "r"));
    const rowIndex = Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber - 1 : grid.length;
    const cells: string[] = [];

    for (const cellMatch of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = attr(attrs, "r");
      const colIndex = ref ? columnIndex(ref) : cells.length;
      const type = attr(attrs, "t");
      const style = Number(attr(attrs, "s") ?? "-1");

      let value = "";
      if (type === "inlineStr") {
        const parts = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
        value = parts
          .map((t) => unescapeXml(t.replace(/^<t\b[^>]*>/, "").replace(/<\/t>$/, "")))
          .join("");
      } else {
        const raw = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
        if (raw != null) {
          const text = unescapeXml(raw);
          if (type === "s") {
            value = sharedStrings[Number(text)] ?? "";
          } else if (type === "b") {
            value = text === "1" ? "VRAI" : "FAUX";
          } else if (type === "str") {
            value = text;
          } else if (dateStyles.has(style) && text.trim() !== "" && !Number.isNaN(Number(text))) {
            value = serialToFrDate(Number(text));
          } else {
            value = text;
          }
        }
      }

      cells[colIndex] = value.trim();
    }

    for (let i = 0; i < cells.length; i += 1) if (cells[i] == null) cells[i] = "";
    grid[rowIndex] = cells;
    width = Math.max(width, cells.length);
  }

  const normalised: string[][] = [];
  for (let r = 0; r < grid.length; r += 1) {
    const filled = grid[r] ?? [];
    normalised.push(Array.from({ length: width }, (_, i) => filled[i] ?? ""));
  }

  while (normalised.length > 0 && normalised[normalised.length - 1].every((c) => c === "")) {
    normalised.pop();
  }
  return normalised;
}
