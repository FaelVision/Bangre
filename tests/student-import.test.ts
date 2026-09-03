import test from "node:test";
import assert from "node:assert/strict";
import {
  parseStudentsFile,
  parseStudentsRows,
  rowsFromColumns,
  columnsFromMapping,
  splitFullName,
  detectDelimiter,
} from "../src/lib/student-import";

const fields = (text: string) => parseStudentsFile(text).columns.map((c) => c.field);

test("columns are recognised whatever their order", () => {
  const parsed = parseStudentsFile(
    [
      "Prénom,Date de naissance,Nom,Numéro parent,Matricule",
      "Ali,26/11/2006,OUEDRAOGO,+226 70 11 22 33,BG-451",
      "Awa,03/02/2007,SAWADOGO,70223344,BG-452",
    ].join("\n")
  );

  assert.deepEqual(parsed.rows[0], {
    line: 2,
    matricule: "BG-451",
    lastName: "OUEDRAOGO",
    firstName: "Ali",
    birthDate: "26/11/2006",
    age: "",
    gender: "",
    parentName: "",
    parentPhone: "+226 70 11 22 33",
  });
  assert.equal(parsed.rows.length, 2);
});

test("headers are matched despite accents, case, abbreviations and punctuation", () => {
  const parsed = parseStudentsFile(
    [
      "N° Mat.;NOM DE FAMILLE;Prénoms;Né(e) le;Sexe;Tél. du parent;Âge",
      "BG-451;OUEDRAOGO;Ali Bertrand;26/11/2006;M;70112233;19",
    ].join("\n")
  );

  assert.deepEqual(fields(
    "N° Mat.;NOM DE FAMILLE;Prénoms;Né(e) le;Sexe;Tél. du parent;Âge\nBG-451;OUEDRAOGO;Ali;26/11/2006;M;70112233;19"
  ), ["matricule", "lastName", "firstName", "birthDate", "gender", "parentPhone", "age"]);
  assert.equal(parsed.rows[0].firstName, "Ali Bertrand");
  assert.equal(parsed.rows[0].gender, "M");
  assert.equal(parsed.rows[0].age, "19");
});

test("the excel semicolon export is read like a comma one", () => {
  assert.equal(detectDelimiter(["Nom;Prenom;Tel", "OUEDRAOGO;Ali;70112233"]), ";");
  assert.equal(detectDelimiter(["Nom\tPrenom\tTel", "OUEDRAOGO\tAli\t70112233"]), "\t");

  const parsed = parseStudentsFile("Nom;Prenom;Tel\nOUEDRAOGO;Ali;70112233");
  assert.equal(parsed.rows[0].lastName, "OUEDRAOGO");
  assert.equal(parsed.rows[0].parentPhone, "70112233");
});

test("a title row above the header is skipped", () => {
  const parsed = parseStudentsFile(
    [
      "LISTE DES ÉLÈVES — 6e A,,,",
      "Année scolaire 2026-2027,,,",
      "Matricule,Nom,Prénom,Date de naissance",
      "BG-451,OUEDRAOGO,Ali,26/11/2006",
    ].join("\n")
  );

  assert.equal(parsed.headerLine, 3);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].line, 4);
});

test("a file with no header at all is read from its values", () => {
  const parsed = parseStudentsFile(
    [
      "BG-451,OUEDRAOGO,Ali,26/11/2006,70112233",
      "BG-452,SAWADOGO,Awa,03/02/2007,70223344",
      "BG-453,KABORE,Salif,15/07/2006,70334455",
    ].join("\n")
  );

  assert.equal(parsed.headerLine, null);
  assert.equal(parsed.rows.length, 3);
  assert.deepEqual(parsed.columns.map((c) => c.field), [
    "matricule",
    "lastName",
    "firstName",
    "birthDate",
    "parentPhone",
  ]);
});

test("a single name column is split into nom and prénom", () => {
  const parsed = parseStudentsFile(
    ["Nom et prénom,Contact", "OUEDRAOGO Ali Bertrand,70112233", "SAWADOGO Awa,70223344"].join("\n")
  );

  assert.equal(parsed.rows[0].lastName, "OUEDRAOGO");
  assert.equal(parsed.rows[0].firstName, "Ali Bertrand");
  assert.equal(parsed.rows[1].lastName, "SAWADOGO");
  assert.equal(parsed.rows[1].firstName, "Awa");
});

test("a lone Nom column holds both names too", () => {
  const parsed = parseStudentsFile(["Nom,Tel", "OUEDRAOGO Ali,70112233"].join("\n"));
  assert.equal(parsed.rows[0].lastName, "OUEDRAOGO");
  assert.equal(parsed.rows[0].firstName, "Ali");
});

test("splitFullName reads capitals, commas and plain word order", () => {
  assert.deepEqual(splitFullName("OUEDRAOGO Ali Bertrand"), {
    lastName: "OUEDRAOGO",
    firstName: "Ali Bertrand",
  });
  assert.deepEqual(splitFullName("Ouedraogo, Ali"), { lastName: "Ouedraogo", firstName: "Ali" });
  assert.deepEqual(splitFullName("Ouedraogo Ali"), { lastName: "Ouedraogo", firstName: "Ali" });
  assert.deepEqual(splitFullName("OUEDRAOGO"), { lastName: "OUEDRAOGO", firstName: "" });
  assert.deepEqual(splitFullName("   "), { lastName: "", firstName: "" });
});

test("a row-number column is never taken for a phone number", () => {
  const parsed = parseStudentsFile(
    ["N°,Nom,Prénom,Numéro", "1,OUEDRAOGO,Ali,70112233", "2,SAWADOGO,Awa,70223344"].join("\n")
  );

  assert.equal(parsed.rows[0].parentPhone, "70112233");
  assert.equal(parsed.rows[0].matricule, "");
});

test("a header lying about its column is overruled by the values", () => {
  // "Numéro" numbering the rows, and nothing that parses as a date under
  // "Date de naissance" — both mappings are dropped rather than trusted.
  const parsed = parseStudentsFile(
    [
      "Numéro,Nom,Prénom,Date de naissance",
      "1,OUEDRAOGO,Ali,néant",
      "2,SAWADOGO,Awa,néant",
    ].join("\n")
  );

  assert.equal(parsed.rows[0].parentPhone, "");
  assert.equal(parsed.rows[0].birthDate, "");
  assert.equal(parsed.rows[0].lastName, "OUEDRAOGO");
});

test("quoted cells keep their commas", () => {
  const parsed = parseStudentsFile(
    ['Nom,Prénom,Parent', '"OUEDRAOGO","Ali","OUEDRAOGO, Issa"'].join("\n")
  );
  assert.equal(parsed.rows[0].parentName, "OUEDRAOGO, Issa");
});

test("empty and repeated header lines are not students", () => {
  const parsed = parseStudentsFile(
    [
      "Matricule,Nom,Prénom",
      "BG-451,OUEDRAOGO,Ali",
      "",
      "Matricule,Nom,Prénom",
      "BG-452,SAWADOGO,Awa",
    ].join("\n")
  );

  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows.map((r) => r.firstName), ["Ali", "Awa"]);
});

test("an empty file yields nothing rather than throwing", () => {
  const parsed = parseStudentsFile("\n\n  \n");
  assert.deepEqual(parsed.rows, []);
  assert.deepEqual(parsed.columns, []);
});

test("parseStudentsRows reads an already-tabular source like a CSV", () => {
  const parsed = parseStudentsRows([
    ["Matricule", "Nom", "Prénom", "Date de naissance"],
    ["BG-451", "OUEDRAOGO", "Ali", "26/11/2006"],
    ["", "", "", ""],
    ["BG-452", "SAWADOGO", "Awa", "03/02/2007"],
  ]);

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[1].line, 4);
  assert.equal(parsed.headerLine, 1);
  assert.deepEqual(parsed.columns.map((c) => c.field), [
    "matricule",
    "lastName",
    "firstName",
    "birthDate",
  ]);
});

test("a user mapping overrides what was auto-detected", () => {
  // Auto-detection would read column 0 as an age; the user says it is the
  // matricule, and marks the real age column as ignored.
  const parsed = parseStudentsRows([
    ["Réf", "Nom", "Prénom", "Années"],
    ["12", "OUEDRAOGO", "Ali", "19"],
    ["13", "SAWADOGO", "Awa", "18"],
  ]);

  const columns = columnsFromMapping(
    { 0: "matricule", 1: "lastName", 2: "firstName", 3: "" },
    parsed.headers
  );
  const rows = rowsFromColumns(parsed.dataGrid, columns);

  assert.equal(rows[0].matricule, "12");
  assert.equal(rows[0].age, "");
  assert.equal(rows[0].lastName, "OUEDRAOGO");
  assert.equal(rows[1].matricule, "13");
});

test("columnsFromMapping drops empty and invalid entries", () => {
  const columns = columnsFromMapping(
    { 0: "lastName", 1: "", 2: "firstName" },
    ["A", "B", "C"]
  );
  assert.deepEqual(columns.map((c) => c.field), ["lastName", "firstName"]);
  assert.equal(columns[0].how, "manual");
  assert.equal(columns[1].header, "C");
});
