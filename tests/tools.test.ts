import { describe, expect, it, vi } from "vitest";
import {
  calculateCost,
  calculateCostInput,
  checkAvailability,
  copperTools,
} from "@/lib/copper/assistant/tools";

// A fake stock list, so the test needs no database.
vi.mock("@/lib/copper/inventory", () => ({
  readInventory: async () => [
    {
      sku: "CH-TEA",
      product: "Copper Home",
      color: "Patina Teal",
      units_in_stock: 6,
      next_shipment: "2026-11-06",
    },
    {
      sku: "CN-DSA",
      product: "Copper Notes",
      color: "Desert Sand",
      units_in_stock: 92,
      next_shipment: "2026-11-13",
    },
    {
      sku: "CN-NSK",
      product: "Copper Notes",
      color: "Night Sky",
      units_in_stock: 0,
      next_shipment: "2026-11-14",
    },
  ],
}));

describe("calculate_cost", () => {
  it("counts Copper Plus once: Copper Home, annual, 2 years is $307", () => {
    const result = calculateCost({
      products: ["copper-home"],
      plan: "copper-plus",
      billing: "annual",
      years: 2,
    });
    expect(result.totalUsd).toBe(307);
    expect(result.lines.reduce((s, l) => s + l.usd, 0)).toBe(result.totalUsd);
  });

  it("adds no line for the free plan", () => {
    const result = calculateCost({
      products: ["copper-home", "copper-home"],
      plan: "free",
      billing: "monthly",
      years: 1,
    });
    expect(result.lines).toHaveLength(2);
    expect(result.totalUsd).toBe(298);
  });

  it("rejects input outside the contract", () => {
    const ok = {
      products: ["copper-home"],
      plan: "free",
      billing: "annual",
      years: 1,
    };
    expect(calculateCostInput.safeParse(ok).success).toBe(true);
    expect(calculateCostInput.safeParse({ ...ok, years: 0 }).success).toBe(
      false,
    );
    expect(calculateCostInput.safeParse({ ...ok, years: 6 }).success).toBe(
      false,
    );
    expect(calculateCostInput.safeParse({ ...ok, years: 1.5 }).success).toBe(
      false,
    );
    expect(
      calculateCostInput.safeParse({
        ...ok,
        products: Array(6).fill("copper-home"),
      }).success,
    ).toBe(false);
  });
});

describe("check_availability", () => {
  it("says Patina Teal is not a color for Copper Notes", async () => {
    const result = await checkAvailability({
      product: "copper-notes",
      color: "Patina Teal",
    });
    expect(result.status).toBe("not_a_color");
  });

  it("sorts stock into in stock, low stock and back-ordered", async () => {
    const notes = await checkAvailability({ product: "copper-notes" });
    const home = await checkAvailability({
      product: "copper-home",
      color: "patina teal",
    });
    expect(notes).toMatchObject({
      status: "ok",
      colors: expect.arrayContaining([
        { color: "Desert Sand", stock: "in_stock", restockDate: null },
        { color: "Night Sky", stock: "backordered", restockDate: "2026-11-14" },
      ]),
    });
    expect(home).toMatchObject({
      status: "ok",
      colors: [{ color: "Patina Teal", stock: "low_stock", restockDate: null }],
    });
  });
});

describe("copperTools", () => {
  it("has the four tools, each with a description", () => {
    expect(Object.keys(copperTools).sort()).toEqual([
      "calculate_cost",
      "check_availability",
      "get_prices",
      "get_products",
    ]);
    for (const t of Object.values(copperTools)) {
      expect(t.description).toBeTruthy();
    }
  });
});
