import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { xlsxToRows } from "../src/lib/xlsx";
import { parseStudentsRows } from "../src/lib/student-import";

/** Assemble a minimal but real .xlsx from its XML parts. */
function makeXlsx(parts: Record<string, string>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [path, xml] of Object.entries(parts)) files[path] = strToU8(xml);
  return zipSync(files);
}

const WORKBOOK = `<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Feuil1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    Target="worksheets/sheet1.xml"/>
</Relationships>`;

// Style index 1 is a builtin date format (numFmtId 14).
const STYLES = `<?xml version="1.0"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;

function sharedStrings(values: string[]): string {
  const items = values.map((v) => `<si><t>${v}</t></si>`).join("");
  return `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${values.length}" uniqueCount="${values.length}">${items}</sst>`;
}

function sheet(rowsXml: string): string {
  return `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

test("xlsxToRows reads shared strings and converts a date-formatted serial", () => {
  const strings = ["Matricule", "Nom", "Prénom", "Date de naissance", "BG-451", "OUEDRAOGO", "Ali"];
  const bytes = makeXlsx({
    "xl/workbook.xml": WORKBOOK,
    "xl/_rels/workbook.xml.rels": WORKBOOK_RELS,
    "xl/styles.xml": STYLES,
    "xl/sharedStrings.xml": sharedStrings(strings),
    "xl/worksheets/sheet1.xml": sheet(
      `<row r="1">
         <c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>
         <c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c>
       </row>
       <row r="2">
         <c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c>
         <c r="C2" t="s"><v>6</v></c><c r="D2" s="1"><v>39047</v></c>
       </row>`
    ),
  });

  assert.deepEqual(xlsxToRows(bytes), [
    ["Matricule", "Nom", "Prénom", "Date de naissance"],
    ["BG-451", "OUEDRAOGO", "Ali", "26/11/2006"],
  ]);
});

test("xlsxToRows reads inline strings and skips a leading blank column", () => {
  const bytes = makeXlsx({
    "xl/workbook.xml": WORKBOOK,
    "xl/_rels/workbook.xml.rels": WORKBOOK_RELS,
    "xl/styles.xml": STYLES,
    "xl/sharedStrings.xml": sharedStrings([]),
    "xl/worksheets/sheet1.xml": sheet(
      `<row r="1">
         <c r="B1" t="inlineStr"><is><t>Nom</t></is></c>
         <c r="C1" t="inlineStr"><is><t>Prénom</t></is></c>
       </row>
       <row r="2">
         <c r="B2" t="inlineStr"><is><t>SAWADOGO</t></is></c>
         <c r="C2" t="inlineStr"><is><t>Awa</t></is></c>
       </row>`
    ),
  });

  assert.deepEqual(xlsxToRows(bytes), [
    ["", "Nom", "Prénom"],
    ["", "SAWADOGO", "Awa"],
  ]);
});

test("a non-xlsx buffer throws rather than returning garbage", () => {
  assert.throws(() => xlsxToRows(strToU8("just,a,csv\n1,2,3")));
});

test("parseStudentsRows recognises columns from an xlsx grid", () => {
  const parsed = parseStudentsRows([
    ["Prénom", "Date de naissance", "Nom", "Matricule"],
    ["Ali", "26/11/2006", "OUEDRAOGO", "BG-451"],
    ["Awa", "03/02/2007", "SAWADOGO", "BG-452"],
  ]);

  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0], {
    line: 2,
    matricule: "BG-451",
    lastName: "OUEDRAOGO",
    firstName: "Ali",
    birthDate: "26/11/2006",
    age: "",
    gender: "",
    parentName: "",
    parentPhone: "",
  });
  assert.equal(parsed.width, 4);
  assert.deepEqual(parsed.headers, ["Prénom", "Date de naissance", "Nom", "Matricule"]);
});
