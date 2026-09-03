import test from "node:test";
import assert from "node:assert/strict";
import { frToIso, isoToFr, autoFormatDate, parseDateInput } from "../src/lib/date";

test("frToIso accepts french typed dates", () => {
  assert.equal(frToIso("26/11/2006"), "2006-11-26");
  assert.equal(frToIso("1/2/2006"), "2006-02-01");
  assert.equal(frToIso("26-11-2006"), "2006-11-26");
  assert.equal(frToIso("26.11.2006"), "2006-11-26");
  assert.equal(frToIso("26/11/06"), "2006-11-26");
  assert.equal(frToIso("26/11/55"), "1955-11-26");
});

test("frToIso passes through and validates ISO", () => {
  assert.equal(frToIso("2006-11-26"), "2006-11-26");
  assert.equal(frToIso("2006-13-01"), "");
  assert.equal(frToIso("2006-02-30"), "");
});

test("frToIso rejects nonsense", () => {
  assert.equal(frToIso(""), "");
  assert.equal(frToIso("hello"), "");
  assert.equal(frToIso("32/11/2006"), "");
  assert.equal(frToIso("26/13/2006"), "");
});

test("isoToFr round-trips", () => {
  assert.equal(isoToFr("2006-11-26"), "26/11/2006");
  assert.equal(isoToFr(new Date(Date.UTC(2006, 10, 26))), "26/11/2006");
  assert.equal(isoToFr(null), "");
});

test("autoFormatDate inserts slashes", () => {
  assert.equal(autoFormatDate("26"), "26");
  assert.equal(autoFormatDate("2611"), "26/11");
  assert.equal(autoFormatDate("26112006"), "26/11/2006");
  assert.equal(autoFormatDate("26/11/2006"), "26/11/2006");
});

test("parseDateInput returns UTC date or null", () => {
  const d = parseDateInput("26/11/2006");
  assert.ok(d instanceof Date);
  assert.equal(d?.toISOString(), "2006-11-26T00:00:00.000Z");
  assert.equal(parseDateInput(""), null);
  assert.equal(parseDateInput("bad"), null);
});
