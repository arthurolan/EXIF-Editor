import assert from "node:assert/strict";
import test from "node:test";

import {
  appleMapsCoordinates,
  isInMainlandChina,
  wgs84ToGcj02,
} from "../app/coordinate-conversion.mjs";

test("recognizes representative mainland and Hainan positions", () => {
  assert.equal(isInMainlandChina(31.230416, 121.473701), true);
  assert.equal(isInMainlandChina(39.908823, 116.39747), true);
  assert.equal(isInMainlandChina(19.2, 109.7), true);
  assert.equal(isInMainlandChina(22.5431, 114.0579), true); // Shenzhen
});

test("does not convert representative positions outside mainland China", () => {
  const positions = [
    [18.787921, 98.99603], // Thailand — inside the usual rectangular China check
    [25.033, 121.5654], // Taiwan
    [22.3193, 114.1694], // Hong Kong (outside the Natural Earth mainland ring)
    [22.1987, 113.5439], // Macao
    [35.6762, 139.6503], // Japan
    [37.3349, -122.009], // United States
  ];

  for (const [latitude, longitude] of positions) {
    assert.equal(isInMainlandChina(latitude, longitude), false);
    assert.deepEqual(appleMapsCoordinates(latitude, longitude), {
      latitude,
      longitude,
      converted: false,
    });
  }
});

test("converts WGS-84 to expected GCJ-02 coordinates in Shanghai", () => {
  const converted = wgs84ToGcj02(31.230416, 121.473701);
  assert.equal(converted.converted, true);
  assert.ok(Math.abs(converted.latitude - 31.228474) < 0.000001);
  assert.ok(Math.abs(converted.longitude - 121.478224) < 0.000001);
});
