#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { createOpenAICompatibleClient, getOpenAICompatibleConfig } from "./model/deepseek.js";
import { AgentEngine } from "./agent/engine.js";
import { initNovelWorkspace } from "./novel/init.js";
import { getCommands } from "./commands/loader.js";
import { parseSlashInput, type CommandRuntimeEngine } from "./commands/types.js";

interface CliOptions {
  confirmPermissions?: boolean;
}

async function askConfirmation(question: string): Promise<boolean> {
  return await confirm({ message: question, default: false });
}

function requireConfig() {
  const config = getOpenAICompatibleConfig();
  if (!config) {
    throw new Error("OpenAI-compatible provider is not configured. Set NG_API_KEY, NG_BASE_URL, and NG_MODEL before running agent tasks.");
  }
  return config;
}

async function createEngine(cwd: string, options: CliOptions = {}): Promise<AgentEngine> {
  const config = requireConfig();
  return new AgentEngine({
    cwd,
    client: createOpenAICompatibleClient(config),
    model: config.model,
    permissionMode: options.confirmPermissions ? "confirm" : "bypass",
    askConfirmation,
  });
}

async function runPrint(prompt: string, cwd: string, options: CliOptions): Promise<void> {
  const engine = await createEngine(cwd, options);
  const result = await engine.submitMessage(prompt);
  console.log(result.text);
  if (result.toolTrace.length) {
    console.error(`\nTools: ${result.toolTrace.join(", ")}`);
  }
}

async function runSlashCommand(inputText: string, cwd: string, options: CliOptions, activeEngine?: CommandRuntimeEngine): Promise<string | null> {
  const parsed = parseSlashInput(inputText);
  if (!parsed) return null;
  const command = (await getCommands(cwd)).find((item) => item.name === parsed.name);
  if (!command) return `Unknown command: /${parsed.name}`;
  const toolContext = {
    cwd,
    permissionMode: options.confirmPermissions ? "confirm" as const : "bypass" as const,
    askConfirmation,
    engine: activeEngine,
  };
  if (command.type === "local") {
    const result = await command.execute(parsed.args, toolContext);
    return result.content;
  }
  const expanded = await command.getPromptForCommand(parsed.args, toolContext);
  if (activeEngine instanceof AgentEngine) {
    const result = await activeEngine.submitMessage(expanded, { systemMeta: true });
    return result.text;
  }
  const engine = await createEngine(cwd, options);
  const result = await engine.submitMessage(expanded, { systemMeta: true });
  return result.text;
}

async function runRepl(cwd: string, options: CliOptions): Promise<void> {
  console.log("Novel Guide");
  console.log(`Workspace: ${cwd}`);
  console.log("Permissions: full access by default. Use --confirm-permissions to ask before writes/shell.");
  console.log("Type /exit to quit, /novel-init [project] to initialize.");
  const engine = await createEngine(cwd, options);
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const line = await rl.question("\nng> ");
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === "/exit" || trimmed === "exit") break;
      if (trimmed === "/clear") {
        console.log("Start a new terminal session to clear persisted context.");
        continue;
      }
      if (trimmed.startsWith("/")) {
        const slashResult = await runSlashCommand(trimmed, cwd, options, engine);
        if (slashResult !== null) {
          console.log(slashResult);
          continue;
        }
      }
      const result = await engine.submitMessage(trimmed);
      console.log(result.text);
      if (result.toolTrace.length) console.log(`\n[tools] ${result.toolTrace.join(", ")}`);
    }
  } finally {
    rl.close();
  }
}

async function doctor(): Promise<void> {
  const config = getOpenAICompatibleConfig();
  console.log("Novel Guide doctor");
  console.log(`Node: ${process.version}`);
  console.log(`CWD: ${process.cwd()}`);
  if (!config) {
    console.log("OpenAI-compatible provider: missing configuration");
    return;
  }
  console.log(`OpenAI-compatible provider: ${config.provider} (${config.baseUrl}, model ${config.model})`);
  const client = createOpenAICompatibleClient(config);
  const engine = new AgentEngine({
    cwd: process.cwd(),
    client,
    model: config.model,
    permissionMode: "bypass",
    askConfirmation,
    maxLoops: 1,
    readonlyOnly: true,
  });
  const result = await engine.submitMessage("Reply with OK only.", { save: false });
  console.log(`Model smoke: ${result.text.slice(0, 120)}`);
}

const program = new Command();
program
  .name("ng")
  .description("Novel Guide - a native agent for novel workspaces")
  .version("0.1.0")
  .option("-p, --print <prompt>", "run one non-interactive prompt and exit")
  .option("-C, --cwd <dir>", "workspace directory", process.cwd())
  .option("--confirm-permissions", "ask before writes and shell commands");

program
  .command("init [projectName]")
  .description("initialize a Novel Guide workspace")
  .action(async (projectName: string | undefined) => {
    const cwd = process.cwd();
    const name = projectName?.trim() || path.basename(cwd);
    const result = await initNovelWorkspace(cwd, name);
    console.log(`Novel workspace initialized for: ${name}`);
    console.log(`Created: ${result.created.length}`);
    console.log(`Skipped: ${result.skipped.length}`);
    if (result.skipped.length) {
      console.log("Existing items were not overwritten:");
      for (const item of result.skipped) console.log(`- ${item}`);
    }
    console.log("Tip: run git init when you are ready to track this workspace.");
  });

program
  .command("doctor")
  .description("check local setup and DeepSeek connectivity")
  .action(async () => {
    await doctor();
  });

program.action(async (opts: { print?: string; cwd: string; confirmPermissions?: boolean }) => {
  const cwd = path.resolve(opts.cwd);
  if (opts.print) {
    await runPrint(opts.print, cwd, opts);
  } else {
    await runRepl(cwd, opts);
  }
});

program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ng: ${message}`);
  process.exitCode = 1;
});
