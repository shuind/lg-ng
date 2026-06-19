import { describe, expect, it } from "vitest";
import { buildEffectiveSystemPrompt, DEFAULT_SYSTEM_PROMPT } from "../src/prompts/systemPrompt.js";

describe("system prompt", () => {
  it("builds the default prompt without runtime novel workspace rules", async () => {
    const prompt = await buildEffectiveSystemPrompt({});

    expect(prompt).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(prompt).not.toContain("# \u5c0f\u8bf4\u5de5\u4f5c\u533a\u89c4\u5219");
    expect(prompt).not.toContain("\u7ae0\u8282\u8349\u7a3f\u7b56\u7565");
    expect(prompt).not.toContain("\u5c0f\u8bf4\u68c0\u67e5\u8bed\u4e49");
    expect(prompt).not.toContain("\u5199\u5165\u62a5\u544a\u89c4\u5219");
  });

  it("appends explicit system prompt content", async () => {
    const prompt = await buildEffectiveSystemPrompt({ appendSystemPrompt: "extra rules" });

    expect(prompt).toBe(`${DEFAULT_SYSTEM_PROMPT}\n\nextra rules`);
  });

  it("lets overrideSystemPrompt replace the composed prompt", async () => {
    await expect(
      buildEffectiveSystemPrompt({
        appendSystemPrompt: "ignored",
        overrideSystemPrompt: "override only",
      }),
    ).resolves.toBe("override only");
  });
});
