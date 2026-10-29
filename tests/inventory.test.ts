import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("@/lib/supabase/server");
  vi.resetModules();
});

/** Loads readInventory with a fake Supabase client standing in for the database. */
async function loadWith(client: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/supabase/server", () => ({
    createStatelessClient: () => client,
  }));
  return import("@/lib/copper/inventory");
}

const row = {
  sku: "CN-NSK",
  product: "Copper Notes",
  color: "Night Sky",
  units_in_stock: 0,
  next_shipment: "2026-11-14",
};

describe("readInventory", () => {
  it("returns the rows from the inventory table", async () => {
    const select = vi.fn().mockResolvedValue({ data: [row], error: null });
    const from = vi.fn().mockReturnValue({ select });
    const { readInventory } = await loadWith({ from });
    expect(await readInventory()).toEqual([row]);
    expect(from).toHaveBeenCalledWith("inventory");
  });

  it("returns null when Supabase isn't set up", async () => {
    const { readInventory } = await loadWith(null);
    expect(await readInventory()).toBeNull();
  });

  it("returns null when the database can't be read", async () => {
    const failing = {
      from: () => ({
        select: () => Promise.resolve({ data: null, error: { message: "no" } }),
      }),
    };
    const { readInventory } = await loadWith(failing);
    expect(await readInventory()).toBeNull();

    const throwing = {
      from: () => ({ select: () => Promise.reject(new Error("offline")) }),
    };
    const again = await loadWith(throwing);
    expect(await again.readInventory()).toBeNull();
  });
});
