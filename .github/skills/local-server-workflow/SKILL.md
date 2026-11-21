---
name: local-server-workflow
description: "Safely prepare, inspect, and troubleshoot local development servers and background processes. Use for dev-server startup, readiness checks, logs, ports, and shutdown planning."
---

# Local Server Workflow

## Procedure

1. Read `AGENTS.md` and the relevant package scripts or task configuration before suggesting a command. Do not assume a server command, port, or process owner.
2. Ask the user before starting, stopping, restarting, or changing any long-running process. Explain the command and expected effect.
3. Follow the repository rule that the user runs npm, Node, TypeScript, build, and test commands in their own PowerShell. Provide the narrow command and let the user run it.
4. Never use `npx`, `cmd.exe`, `shell: true`, or an unapproved remote process manager. Do not launch an MCP server; the user configures and starts MCP servers manually.
5. When the user shares output, diagnose from the exact command, exit code, logs, URL, and port. Separate confirmed facts from hypotheses.
6. For readiness, use an approved browser or MCP capability only after the user starts the server and provides or confirms the local URL. Do not claim a service is running without a successful check.
7. Before suggesting shutdown, identify the exact process and confirm it belongs to this task. Never kill a process by a broad name, terminate an unrelated port owner, or stop a process without approval.
8. Keep logs limited to the relevant time and lines. Redact tokens, credentials, personal data, and environment values before quoting them.
9. Report what the user should run next, how to recognize readiness or failure, and whether the server is expected to remain running.

## Safety and project rules

- `AGENTS.md` is authoritative. If it prohibits executing commands, do not execute them even if a server tool is available.
- Do not edit `.env`, secrets, or process state. Do not delete directories or files as server cleanup.
- Avoid persistent/background process changes unless the user explicitly requests them.
