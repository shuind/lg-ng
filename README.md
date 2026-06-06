# LG-NG

LG-NG combines the LG writing workspace UI with the Novel Guide agent core.

The current product line is AI direct collaboration for novel projects: the
agent may read and write book files directly, while LG records writes in
`ledger.jsonl` and marks dirty files for later indexing. The right sidebar is
focused on project state: recent changes plus setting cards.

- `apps/lg`: Next.js UI, book/chapter management, writing desk, chat surface,
  workbench, Ledger, and project Skill management.
- `packages/novel-guide`: local workspace agent, tools, skills, subagents, and
  sessions.

Run from this directory:

```bash
pnpm install
pnpm build
pnpm dev
```

The LG chat API uses Novel Guide directly. The old LG runtime is not part of this merged app.
