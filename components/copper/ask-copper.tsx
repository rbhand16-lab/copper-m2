"use client";

// Module 2: the floating Ask Copper chat. The launcher opens a side panel with
// two separate conversations (tools on and tools off); each question calls the
// askCopper Server Action and draws its steps as they stream in.
import { ArrowUpIcon, MessageCircleIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Answer } from "@/components/copper/ask-copper-answer";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import type { Progress } from "@/lib/copper/assistant/progress";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

const SORRY: Progress = {
  steps: [],
  reply: "Sorry, I couldn't come up with an answer. Please try again.",
  status: "error",
};

type Turn = { question: string; progress: Progress | null };
type Chats = { on: Turn[]; off: Turn[] };

/** The conversation so far, as the model should see it: finished turns only. */
function historyOf(turns: Turn[]): ChatMessage[] {
  return turns.flatMap((turn) =>
    turn.progress?.status === "done"
      ? [
          { role: "user" as const, content: turn.question },
          { role: "assistant" as const, content: turn.progress.reply },
        ]
      : [],
  );
}

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Chats>({ on: [], off: [] });
  const [draft, setDraft] = useState("");
  const body = useRef<HTMLDivElement>(null);

  // Open from the header's #ask link, and when the site loads at /#ask. Listen
  // for the click as well as the hash: once the address already ends in #ask,
  // clicking the link again fires no hashchange.
  useEffect(() => {
    const openIfAsk = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a");
      if (link?.getAttribute("href")?.endsWith("#ask")) setOpen(true);
    };
    openIfAsk();
    window.addEventListener("hashchange", openIfAsk);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", openIfAsk);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const key = useTools ? "on" : "off";
  const turns = chats[key];
  const last = turns.at(-1);
  const busy = !!last && (!last.progress || last.progress.status === "working");

  // Keep the newest step in view as the answer streams in.
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chats, key, open]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const chat = key;
    const index = chats[chat].length;
    const messages = [
      ...historyOf(chats[chat]),
      { role: "user" as const, content: text },
    ];
    const show = (progress: Progress) =>
      setChats((current) => ({
        ...current,
        [chat]: current[chat].map((turn, i) =>
          i === index ? { ...turn, progress } : turn,
        ),
      }));

    setDraft("");
    setChats((current) => ({
      ...current,
      [chat]: [...current[chat], { question: text, progress: null }],
    }));
    try {
      const result = await askCopper({ messages, useTools: chat === "on" });
      for await (const progress of readLive(result.progress)) show(progress);
    } catch {
      show(SORRY);
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="ask-copper-launcher"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg transition-transform hover:scale-105"
      >
        <MessageCircleIcon className="size-5" aria-hidden />
        Ask Copper
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          showCloseButton={false}
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <div className="bg-chart-5 text-white">
            <div className="flex items-center gap-3 p-4">
              <span className="bg-primary flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
                <Image
                  src="/assets/brand/copper-mascot.png"
                  alt="Copper the robot mascot"
                  width={1254}
                  height={1254}
                  sizes="40px"
                  className="size-9 object-contain"
                />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base font-semibold text-white">
                  Ask Copper
                </SheetTitle>
                <SheetDescription className="text-xs text-white/70">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white hover:bg-white/10 hover:text-white"
                >
                  <XIcon />
                  <span className="sr-only">Close</span>
                </Button>
              </SheetClose>
            </div>
            <div className="flex items-center justify-between gap-3 bg-white/10 px-4 py-2">
              <div>
                <p className="text-sm font-medium">Use tools</p>
                <p className="text-xs text-white/70">
                  {useTools ? "Checks every answer" : "Model guesses alone"}
                </p>
              </div>
              <Switch
                aria-label="Use tools"
                checked={useTools}
                onCheckedChange={setUseTools}
              />
            </div>
          </div>

          {aiConfigured ? (
            <>
              <div
                ref={body}
                className="bg-secondary flex-1 space-y-6 overflow-y-auto p-4"
              >
                {turns.map((turn, i) => (
                  <div key={i} className="space-y-3">
                    <p className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-sm px-3 py-2 text-sm">
                      {turn.question}
                    </p>
                    <Answer progress={turn.progress} useTools={useTools} />
                  </div>
                ))}
                {!busy && (
                  <div className="flex flex-col items-start gap-2">
                    {STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => send(starter)}
                        className="bg-card hover:border-primary rounded-full border px-3 py-1.5 text-left text-sm transition-colors"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
                className="bg-background flex items-center gap-2 border-t p-3"
              >
                <input
                  type="text"
                  aria-label="Your question"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask about prices or stock"
                  className="bg-card focus-visible:ring-ring min-w-0 flex-1 rounded-full border px-4 py-2 text-sm outline-none focus-visible:ring-2"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={busy}
                  className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                >
                  <ArrowUpIcon className="size-5" aria-hidden />
                </button>
              </form>
            </>
          ) : (
            <div className="bg-secondary flex-1 overflow-y-auto p-4">
              <SetupRequired service="ai" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
