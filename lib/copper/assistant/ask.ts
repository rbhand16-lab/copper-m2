"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, Step } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const APOLOGY = "Sorry, I couldn't come up with an answer. Please try again.";

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  const messages = request.messages.map(({ role, content }) => ({
    role,
    content,
  }));

  const steps: Step[] = [];
  let reply = "";

  // A fresh copy every time: the steps array and each step inside it, so an
  // earlier update never changes after it was sent.
  const snapshot = (status: Progress["status"], text = reply): Progress => ({
    steps: steps.map((step) => ({ ...step })),
    reply: text,
    status,
  });

  const toolStep = (id: string) =>
    steps.find((step) => step.type === "tool" && step.id === id);

  async function run() {
    try {
      const result = callStream(
        { module: 2, feature: "ask-copper" },
        request.useTools
          ? {
              instructions: COPPER_INSTRUCTIONS,
              messages,
              tools: copperTools,
              stopWhen: stepCountIs(MAX_STEPS),
              providerOptions: THOUGHT_SUMMARIES,
            }
          : // Tools off: no instructions and no tools, just the conversation.
            { messages, providerOptions: THOUGHT_SUMMARIES },
      );

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "reasoning-delta": {
            const last = steps.at(-1);
            if (last?.type === "thinking") last.text += part.text;
            else steps.push({ type: "thinking", text: part.text });
            break;
          }
          case "tool-input-start":
            steps.push({
              type: "tool",
              id: part.id,
              name: part.toolName,
              state: "calling",
            });
            break;
          case "tool-call": {
            const step = toolStep(part.toolCallId);
            if (step?.type === "tool") step.input = part.input;
            else
              steps.push({
                type: "tool",
                id: part.toolCallId,
                name: part.toolName,
                state: "calling",
                input: part.input,
              });
            break;
          }
          case "tool-result": {
            const step = toolStep(part.toolCallId);
            if (step?.type === "tool") {
              step.output = part.output;
              step.state = "done";
            }
            break;
          }
          case "tool-error": {
            const step = toolStep(part.toolCallId);
            if (step?.type === "tool") {
              step.output =
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error);
              step.state = "error";
            }
            break;
          }
          case "text-delta":
            reply += part.text;
            break;
          case "error":
            throw part.error;
          default:
            continue;
        }
        update(snapshot("working"));
      }

      // The stream ended normally. An empty reply is still "done", with a
      // short apology; a real reply is never added to.
      done(snapshot("done", reply === "" ? APOLOGY : reply));
    } catch {
      done(snapshot("error", reply === "" ? APOLOGY : reply));
    }
  }

  void run();
  return { progress: live };
}
