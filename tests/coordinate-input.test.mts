import assert from "node:assert/strict";
import test from "node:test";
import { parseCoordinateInput, coordinatePreview } from "../app/coordinate-input";
import { parseBatchGpsEdits } from "../app/batch-processor";

const near = (actual: number | null, expected: number) => { assert.notEqual(actual, null); assert.ok(Math.abs(actual! - expected) < 1e-10, `${actual} != ${expected}`); };

test("parses decimal degrees, DMS and degrees/minutes with common notation", () => {
  const expected = 31 + 13 / 60 + 49.5 / 3600;
  for (const input of ['31°13′49.5″ N', 'N 31° 13\' 49.5"', '北纬31度13分49.5秒', '31 13 49.5', '31:13:49.5', '３１°１３′４９．５″ Ｎ', '31,13,49.5', '31°13.825′', '31 deg 13 min 49.5 sec N', '31°13′49.5 N']) near(parseCoordinateInput(input, 'latitude'), expected);
  near(parseCoordinateInput('31.230416', 'latitude'), 31.230416);
  near(parseCoordinateInput('东经 121°28′25.3″', 'longitude'), 121 + 28 / 60 + 25.3 / 3600);
  near(parseCoordinateInput('S 33 52 7.68', 'latitude'), -(33 + 52 / 60 + 7.68 / 3600));
  near(parseCoordinateInput('−33.8688', 'latitude'), -33.8688);
  near(parseCoordinateInput('西经 0°30′0″', 'longitude'), -0.5);
  assert.equal(parseCoordinateInput('0', 'latitude'), 0);
  assert.equal(parseCoordinateInput('90°0′0″ N', 'latitude'), 90);
  assert.equal(parseCoordinateInput('180 W', 'longitude'), -180);
  assert.equal(coordinatePreview(0), '0');
  assert.equal(coordinatePreview(100), '100');
});

test("rejects ambiguous, contradictory, incomplete and out-of-range coordinates", () => {
  for (const input of ['', ' ', '-31 N', '+31 S', '31 S N', '31 E', '31 60 0', '31 2 60', '90 0 1', '91', '31.2 30', '31 13.5 2', '31°49秒', '31N13', '31,121', '1e2', '0x10', 'NaN', '31abc', '31°13′49.5″ junk']) assert.equal(parseCoordinateInput(input, 'latitude'), null, input);
  assert.equal(parseCoordinateInput('181', 'longitude'), null);
  assert.equal(parseCoordinateInput('121 N', 'longitude'), null);
});

test("batch GPS shares coordinate parsing and rejects missing coordinates", () => {
  assert.equal(parseBatchGpsEdits({ latitude:'',longitude:'',altitude:'',direction:'' }), null);
  const parsed = parseBatchGpsEdits({ latitude:'31°13′49.5″ N',longitude:'121°28′25.3″ E',altitude:'-3.5',direction:'359.5' });
  assert.ok(parsed);
  near(parsed.latitude, 31 + 13 / 60 + 49.5 / 3600);
  assert.equal(parsed.altitude, -3.5);
  assert.equal(parseBatchGpsEdits({ latitude:'31',longitude:'121',altitude:'12m',direction:'' }), null);
  assert.equal(parseBatchGpsEdits({ latitude:'31',longitude:'121',altitude:'',direction:'360' }), null);
});
