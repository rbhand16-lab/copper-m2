// Module 2: the four tools Ask Copper can use. Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  getPlans,
  getProducts,
  type Plan,
  type ProductId,
} from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";

export type ProductList = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};

export type Prices = {
  products: { id: ProductId; name: string; priceUsd: number }[];
  plans: {
    id: Plan["id"];
    name: string;
    monthlyUsd: number;
    annualUsd: number;
  }[];
};

export type CalculateCostInput = {
  products: ProductId[];
  plan: Plan["id"];
  billing: "monthly" | "annual";
  years: number;
};

export type CostBreakdown = {
  lines: { item: string; usd: number }[];
  totalUsd: number;
};

export type CheckAvailabilityInput = { product: ProductId; color?: string };

export type Stock = "in_stock" | "low_stock" | "backordered";

export type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: Stock; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

const productIds = z.enum(["copper-home", "copper-notes"]);

const toCents = (amount: number) => Math.round(amount * 100) / 100;

/** get_products: what Copper sells and which colors each one comes in. */
export function listProducts(): ProductList {
  return {
    products: getProducts().map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      priceUsd: p.priceUsd,
      colors: p.colors,
    })),
  };
}

/** get_prices: every product and plan price, read from the catalog. */
export function getPrices(): Prices {
  return {
    products: getProducts().map((p) => ({
      id: p.id,
      name: p.name,
      priceUsd: p.priceUsd,
    })),
    plans: getPlans().map((p) => ({
      id: p.id,
      name: p.name,
      monthlyUsd: p.monthlyUsd,
      annualUsd: p.annualUsd,
    })),
  };
}

export const calculateCostInput: z.ZodType<CalculateCostInput> = z.object({
  products: z.array(productIds).max(5),
  plan: z.enum(["free", "copper-plus"]),
  billing: z.enum(["monthly", "annual"]),
  years: z.number().int().min(1).max(5),
});

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const catalog = getProducts();
  const lines = input.products.map((id) => {
    const product = catalog.find((p) => p.id === id);
    if (!product) throw new Error(`Unknown product: ${id}`);
    return { item: product.name, usd: toCents(product.priceUsd) };
  });

  // The free plan costs nothing, so it adds no line. Copper Plus covers the
  // whole household, so it is counted once however many devices there are.
  if (input.plan !== "free") {
    const plan = getPlans().find((p) => p.id === input.plan);
    if (!plan) throw new Error(`Unknown plan: ${input.plan}`);
    const usd =
      input.billing === "monthly"
        ? plan.monthlyUsd * 12 * input.years
        : plan.annualUsd * input.years;
    const years = input.years === 1 ? "1 year" : `${input.years} years`;
    lines.push({
      item: `${plan.name}, ${input.billing}, ${years}`,
      usd: toCents(usd),
    });
  }

  const totalUsd = toCents(lines.reduce((sum, line) => sum + line.usd, 0));
  return { lines, totalUsd };
}

export const checkAvailabilityInput: z.ZodType<CheckAvailabilityInput> =
  z.object({
    product: productIds,
    color: z.string().optional(),
  });

function stockOf(units: number): Stock {
  if (units <= 0) return "backordered";
  if (units < 10) return "low_stock";
  return "in_stock";
}

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const product = getProducts().find((p) => p.id === input.product);
  if (!product) {
    return {
      status: "unavailable",
      message: "That product isn't in the catalog.",
    };
  }

  // A color the product doesn't come in is a catalog fact, so check it before
  // touching stock: it holds even when stock can't be read.
  let wanted = product.colors;
  if (input.color !== undefined) {
    const asked = input.color.trim().toLowerCase();
    wanted = product.colors.filter((c) => c.toLowerCase() === asked);
    if (wanted.length === 0) {
      return {
        status: "not_a_color",
        product: product.name,
        color: input.color,
        colors: product.colors,
      };
    }
  }

  const rows = await readInventory();
  if (rows === null) {
    return {
      status: "unavailable",
      message: "Stock can't be checked right now. Please try again later.",
    };
  }

  const colors = wanted.flatMap((color) => {
    const row = rows.find(
      (r) => r.product === product.name && r.color === color,
    );
    if (!row) return [];
    const stock = stockOf(row.units_in_stock);
    return [
      {
        color,
        stock,
        restockDate: stock === "backordered" ? row.next_shipment : null,
      },
    ];
  });
  return { status: "ok", product: product.name, colors };
}

export const copperTools = {
  get_products: tool({
    description:
      "List every Copper product with its type, price and the colors it comes in.",
    inputSchema: z.object({}),
    execute: async () => listProducts(),
  }),
  get_prices: tool({
    description: "Get the price of every Copper product and every plan.",
    inputSchema: z.object({}),
    execute: async () => getPrices(),
  }),
  calculate_cost: tool({
    description:
      "Work out the total cost of devices plus a plan over 1 to 5 years.",
    inputSchema: calculateCostInput,
    execute: async (input) => calculateCost(input),
  }),
  check_availability: tool({
    description:
      "Check today's stock for a Copper product, or for one of its colors.",
    inputSchema: checkAvailabilityInput,
    execute: async (input) => checkAvailability(input),
  }),
} satisfies ToolSet;
