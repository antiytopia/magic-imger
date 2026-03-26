import { describe, expect, it } from "vitest";

import { __test__ } from "../src/core/screenshots/make-shot.js";

describe("computeScrollOffset", () => {
  it("returns 0 when only one shot", () => {
    expect(
      __test__.computeScrollOffset({
        shotIndex: 0,
        totalShots: 1,
        maxScrollY: 1000
      })
    ).toBe(0);
  });

  it("spreads offsets across the scroll range", () => {
    expect(
      __test__.computeScrollOffset({
        shotIndex: 0,
        totalShots: 3,
        maxScrollY: 1000
      })
    ).toBe(0);

    expect(
      __test__.computeScrollOffset({
        shotIndex: 1,
        totalShots: 3,
        maxScrollY: 1000
      })
    ).toBe(500);

    expect(
      __test__.computeScrollOffset({
        shotIndex: 2,
        totalShots: 3,
        maxScrollY: 1000
      })
    ).toBe(1000);
  });

  it("never exceeds maxScrollY", () => {
    expect(
      __test__.computeScrollOffset({
        shotIndex: 10,
        totalShots: 11,
        maxScrollY: 5
      })
    ).toBe(5);
  });
});
