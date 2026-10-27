"use client";

// Module 2: how one Ask Copper answer is drawn, as stations on a rail: the
// tools Copper can use, its thinking, each tool call (what it sent, what came
// back) and the reply. The layout is described in specs/module-2/spec.md.
import { BrainIcon, WrenchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { formatUsd, getPlans, getProducts } from "@/lib/copper/catalog";
import {
  type Progress,
  type ToolStep,
  TOOL_LABELS,
} from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

type Rec = Record<string, unknown>;

const isRec = (value: unknown): value is Rec =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const text = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" ? value : 0);

/** A tool's input can arrive as JSON text; turn it into an object. */
function asInput(input: unknown): Rec | null {
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      return null;
    }
  }
  return isRec(input) ? input : null;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-11-14" → "Nov 14, 2026". */
function formatDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return month >= 1 && month <= 12
    ? `${MONTHS[month - 1]} ${day}, ${year}`
    : iso;
}

/** Renders the **bold** and `code` marks in a thought summary. */
function Markdown({ source }: { source: string }) {
  return source.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="font-mono">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function SentList({ name, input }: { name: string; input: unknown }) {
  if (name === "get_prices")
    return <p>Nothing, it just asked for the price list</p>;
  if (name === "get_products")
    return <p>Nothing, it just asked what Copper sells</p>;
  const data = asInput(input);
  if (!data) return <p className="italic">filling in the details…</p>;

  const names = new Map<string, string>([
    ...getProducts().map((p): [string, string] => [p.id, p.name]),
    ...getPlans().map((p): [string, string] => [p.id, p.name]),
  ]);
  const nameOf = (id: unknown) => names.get(text(id)) ?? text(id);

  if (name === "calculate_cost")
    return (
      <dl className="space-y-1">
        <Row label="Products">
          {asList(data.products).length
            ? asList(data.products).map(nameOf).join(", ")
            : "None"}
        </Row>
        <Row label="Plan">{nameOf(data.plan)}</Row>
        <Row label="Billing">{text(data.billing)}</Row>
        <Row label="Years">{num(data.years)}</Row>
      </dl>
    );
  return (
    <dl className="space-y-1">
      <Row label="Product">{nameOf(data.product)}</Row>
      <Row label="Color">{text(data.color) || "All colors"}</Row>
    </dl>
  );
}

function StockPill({
  stock,
  restockDate,
}: {
  stock: string;
  restockDate: unknown;
}) {
  if (stock === "backordered")
    return (
      <Pill className="bg-chart-3 text-foreground">
        Back-ordered until {formatDate(text(restockDate))}
      </Pill>
    );
  if (stock === "low_stock")
    return <Pill className="bg-chart-4 text-foreground">Low stock</Pill>;
  return <Pill className="bg-accent text-accent-foreground">In stock</Pill>;
}

function BackList({ step }: { step: ToolStep }) {
  const out = step.output;
  if (step.state === "error")
    return <p className="text-chart-3">{text(out) || "That tool failed."}</p>;
  if (!isRec(out)) return <p>{text(out)}</p>;

  if (step.name === "calculate_cost")
    return (
      <div>
        <ul className="space-y-1">
          {asList(out.lines).map((line, i) => {
            const l = isRec(line) ? line : {};
            return (
              <li key={i} className="flex justify-between gap-3">
                <span>{text(l.item)}</span>
                <span className="font-medium">{formatUsd(num(l.usd))}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-baseline justify-between border-t pt-2">
          <span className="font-medium">Total</span>
          <span className="text-primary text-xl font-bold">
            {formatUsd(num(out.totalUsd))}
          </span>
        </div>
      </div>
    );

  if (step.name === "get_products")
    return (
      <ul className="space-y-2">
        {asList(out.products).map((product, i) => {
          const p = isRec(product) ? product : {};
          return (
            <li key={i}>
              <div className="flex justify-between gap-3 font-medium">
                <span>{text(p.name)}</span>
                <span>{formatUsd(num(p.priceUsd))}</span>
              </div>
              <div className="text-muted-foreground text-xs">
                {text(p.type)}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {asList(p.colors).map((color) => (
                  <Pill key={text(color)} className="bg-accent/30">
                    {text(color)}
                  </Pill>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    );

  if (step.name === "get_prices")
    return (
      <ul className="space-y-1">
        {asList(out.products).map((product, i) => {
          const p = isRec(product) ? product : {};
          return (
            <li key={`p${i}`} className="flex justify-between gap-3">
              <span>{text(p.name)}</span>
              <span className="font-medium">{formatUsd(num(p.priceUsd))}</span>
            </li>
          );
        })}
        {asList(out.plans)
          .filter((plan) => isRec(plan) && num(plan.annualUsd) > 0)
          .map((plan, i) => {
            const p = isRec(plan) ? plan : {};
            return (
              <li key={`l${i}`} className="flex justify-between gap-3">
                <span>{text(p.name)}</span>
                <span className="font-medium">
                  {formatUsd(num(p.monthlyUsd))}/mo ·{" "}
                  {formatUsd(num(p.annualUsd))}/yr
                </span>
              </li>
            );
          })}
      </ul>
    );

  // check_availability
  if (out.status === "ok")
    return (
      <ul className="space-y-1">
        {asList(out.colors).map((entry, i) => {
          const c = isRec(entry) ? entry : {};
          return (
            <li key={i} className="flex items-center justify-between gap-3">
              <span>{text(c.color)}</span>
              <StockPill stock={text(c.stock)} restockDate={c.restockDate} />
            </li>
          );
        })}
      </ul>
    );
  if (out.status === "not_a_color")
    return (
      <p>
        {text(out.product)} doesn&apos;t come in {text(out.color)}. It comes in{" "}
        {asList(out.colors).map(text).join(", ")}.
      </p>
    );
  return <p>{text(out.message)}</p>;
}

function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  const running = step.state === "calling";
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card overflow-hidden rounded-lg border text-sm"
    >
      <div className="bg-accent text-accent-foreground flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="font-mono font-bold">{step.name}()</span>
        <span className="bg-accent-foreground/15 rounded px-1.5 text-xs">
          tool {number}
        </span>
        <span className="ml-auto text-xs">{TOOL_LABELS[step.name] ?? ""}</span>
      </div>
      <div className="space-y-1 px-3 py-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          → What Copper sent
        </p>
        <SentList name={step.name} input={step.input} />
      </div>
      <div className="bg-accent/10 space-y-1 border-t px-3 py-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          ← What came back
        </p>
        {running ? (
          <p className="flex items-center gap-2 italic">
            <Spinner className="size-3" /> the app is running the code…
          </p>
        ) : (
          <BackList step={step} />
        )}
      </div>
    </div>
  );
}

function Station({
  node,
  label,
  children,
}: {
  node: ReactNode;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative pb-4 pl-10">
      <div className="ring-secondary absolute top-0 left-0 flex size-7 items-center justify-center rounded-full ring-4">
        {node}
      </div>
      {label && (
        <p className="text-muted-foreground mb-1 pt-1 text-xs font-semibold tracking-widest uppercase">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function Node({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex size-7 items-center justify-center rounded-full [&>svg]:size-4",
        className,
      )}
    >
      {children}
    </span>
  );
}

function statusLine(progress: Progress | null, useTools: boolean) {
  if (progress?.reply) return "Writing the answer…";
  if (!useTools) return "Answering from memory…";
  if (progress?.steps.length) return "Deciding what to do next…";
  return "Reading your question…";
}

export function Answer({
  progress,
  useTools,
}: {
  progress: Progress | null;
  useTools: boolean;
}) {
  const steps = progress?.steps ?? [];
  const working = !progress || progress.status === "working";
  const used = new Set(
    steps.flatMap((step) => (step.type === "tool" ? [step.name] : [])),
  );
  const toolNumbers = steps.map(
    (_, i) => steps.slice(0, i + 1).filter((s) => s.type === "tool").length,
  );
  const accent = useTools ? "bg-accent" : "bg-chart-3";

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          aria-hidden
          className={cn(
            "absolute top-3 bottom-3 left-3.5 w-0.5",
            useTools
              ? "bg-linear-to-b from-primary via-accent to-accent"
              : "bg-chart-3",
          )}
        />
        <Station
          node={<Node className="bg-primary text-primary-foreground">•</Node>}
          label={
            useTools ? "Tools Copper can use" : "Tools given to Copper: none"
          }
        >
          <div className="flex flex-wrap gap-1.5 font-mono text-xs">
            {Object.keys(TOOL_LABELS).map((name) => (
              <span
                key={name}
                className={cn(
                  "rounded px-2 py-0.5",
                  !useTools && "line-through opacity-60",
                  useTools && used.has(name)
                    ? "bg-accent text-accent-foreground font-bold"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {name}
              </span>
            ))}
          </div>
          {!useTools && (
            <p className="text-muted-foreground mt-1 text-xs">
              Copper has to answer from memory alone.
            </p>
          )}
        </Station>
        {steps.map((step, i) =>
          step.type === "thinking" ? (
            <Station
              key={i}
              node={
                <Node
                  className={cn(
                    useTools ? "bg-primary" : "bg-chart-3",
                    "text-primary-foreground",
                  )}
                >
                  <BrainIcon />
                </Node>
              }
              label="Copper is thinking"
            >
              <div
                data-testid="thinking"
                className="text-muted-foreground border-l-2 pl-3 text-sm italic"
              >
                <Markdown source={step.text} />
              </div>
            </Station>
          ) : (
            <Station
              key={step.id}
              node={
                <Node className="bg-accent text-accent-foreground">
                  <WrenchIcon />
                </Node>
              }
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCard step={step} number={toolNumbers[i]} />
            </Station>
          ),
        )}
        {working && (
          <Station
            node={
              <Node className={cn(accent, "animate-pulse")}>
                <span className="text-accent-foreground">···</span>
              </Node>
            }
          >
            <p className="text-muted-foreground pt-1 text-sm">
              {statusLine(progress, useTools)}
            </p>
          </Station>
        )}
      </div>
      {progress?.reply && (
        <div className="bg-card rounded-xl rounded-tl-sm border p-3 text-sm">
          <p className="text-primary mb-1 text-xs font-bold">Copper</p>
          {!useTools && (
            <div className="border-chart-3 mb-2 rounded-md border p-2 text-xs">
              <p>
                <span aria-hidden>⚠ </span>
                <strong>Answered without tools: may be made up</strong>
              </p>
              <p className="mt-1">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="whitespace-pre-wrap">
            {progress.reply}
            {progress.status === "working" && (
              <span aria-hidden className="animate-pulse">
                ▍
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
