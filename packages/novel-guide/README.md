# Novel Guide

Novel Guide is a Claude-Code-like native CLI for novel workspaces.

It keeps the generic agent core: real file tools, grep/glob, shell, git diff,
permission gates, slash commands, skills, subagents, and sessions. The novel
layer is additive and activates when `NOVEL.md` declares `type: novel-workspace`.
