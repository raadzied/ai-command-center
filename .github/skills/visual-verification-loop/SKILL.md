---
name: visual-verification-loop
description: "Verify frontend changes visually and behaviorally with Playwright MCP. Use after UI implementation, for browser testing, screenshot review, responsive checks, and console-error investigation."
---

# Visual Verification Loop

## Procedure

1. Read the relevant UI code and identify the exact requested behavior, visible states, and affected viewport sizes. Do not infer success from a build or screenshot alone.
2. Check whether an approved Playwright MCP server is available. Do not install, configure, or launch an MCP server; the project owner manages MCP configuration.
3. If Playwright MCP is unavailable, state that browser verification could not be performed. Do not claim a test or visual check passed.
4. Open only the user-approved local development URL. Do not navigate to production or unrelated external sites unless the user requested it.
5. Exercise the specific interaction and its important states, including loading, success, failure, disabled controls, and narrow layouts when relevant.
6. Inspect the rendered page and accessibility-relevant labels/roles. Capture a screenshot when the visual result matters.
7. Check browser console errors and relevant failed requests. Distinguish application errors from unrelated browser or environment noise.
8. For changes that depend on Electron IPC, preload APIs, or native permissions, do not treat a normal browser run as end-to-end verification. Report that Electron-specific behavior still needs an Electron smoke test.
9. If the task submits data, changes files, triggers purchases, sends messages, or performs another external side effect, stop before that action and obtain explicit user approval.
10. Report the exact URL/environment tested, actions performed, observed results, and any unverified behavior.

## Safety and project rules

- Follow the repository's `AGENTS.md`; it takes precedence over this workflow.
- Do not expose credentials, private page contents, or personal browser data in reports or screenshots.
- Do not bypass authentication, browser security, or site restrictions.
- Use only the approved MCP tools that are actually available; never invent tool results.
