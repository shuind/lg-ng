import { afterEach, describe, expect, it } from "vitest";
import { getOpenAICompatibleConfig } from "../src/model/deepseek.js";

const ENV_KEYS = [
  "NG_PROVIDER",
  "LLM_PROVIDER",
  "NG_API_KEY",
  "NG_BASE_URL",
  "NG_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "MIMO_API_KEY",
  "MIMO_BASE_URL",
  "MIMO_MODEL",
  "CLAUDE_RELAY_API_KEY",
  "CLAUDE_RELAY_BASE_URL",
  "CLAUDE_RELAY_MODEL",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function resetEnv(): void {
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

afterEach(() => {
  resetEnv();
});

describe("model config", () => {
  it("reads a generic OpenAI-compatible provider from NG_* variables", () => {
    clearEnv();
    process.env.NG_PROVIDER = "custom";
    process.env.NG_API_KEY = "sk-test";
    process.env.NG_BASE_URL = "https://example.test/v1";
    process.env.NG_MODEL = "writer-large";

    expect(getOpenAICompatibleConfig()).toEqual({
      provider: "custom",
      apiKey: "sk-test",
      baseUrl: "https://example.test/v1",
      model: "writer-large",
    });
  });

  it("keeps legacy DeepSeek configuration as the default fallback", () => {
    clearEnv();
    process.env.DEEPSEEK_API_KEY = "sk-deepseek";

    expect(getOpenAICompatibleConfig()).toEqual({
      provider: "deepseek",
      apiKey: "sk-deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
  });
});
