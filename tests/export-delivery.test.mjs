import assert from "node:assert/strict";
import test from "node:test";

import {
  canShareFileOnMobile,
  isMobileDevice,
  outputNameFor,
} from "../app/export-delivery.mjs";

test("adds exactly one edited suffix to JPEG output names", () => {
  assert.equal(outputNameFor("IMG_4846.JPG"), "IMG_4846_edited.jpg");
  assert.equal(outputNameFor("IMG_4846_edited.jpeg"), "IMG_4846_edited.jpg");
});

test("preserves PNG and WebP output extensions", () => {
  assert.equal(outputNameFor("cover.png", "png"), "cover_edited.png");
  assert.equal(outputNameFor("cover_edited.webp", "webp"), "cover_edited.webp");
});

test("detects mobile browsers without treating a desktop Mac as mobile", () => {
  assert.equal(isMobileDevice({ userAgent: "Mozilla/5.0 (iPhone) Mobile" }), true);
  assert.equal(isMobileDevice({ userAgent: "Mozilla/5.0 (Linux; Android 16)" }), true);
  assert.equal(isMobileDevice({ platform: "MacIntel", maxTouchPoints: 5 }), false);
  assert.equal(isMobileDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel" }), false);
});

test("offers the system share sheet only for mobile file sharing", () => {
  const file = { name: "IMG_4846_edited.jpg", type: "image/jpeg" };
  const mobileNavigator = {
    userAgent: "Mozilla/5.0 (iPhone) Mobile",
    share() {},
    canShare({ files }) {
      return files.length === 1 && files[0] === file;
    },
  };

  assert.equal(canShareFileOnMobile(mobileNavigator, file), true);
  assert.equal(
    canShareFileOnMobile({ ...mobileNavigator, userAgent: "Mozilla/5.0 (Macintosh)" }, file),
    false,
  );
  assert.equal(
    canShareFileOnMobile({ ...mobileNavigator, canShare: () => false }, file),
    false,
  );
  assert.equal(
    canShareFileOnMobile({
      ...mobileNavigator,
      canShare() {
        throw new TypeError("unsupported payload");
      },
    }, file),
    false,
  );
});
