# Project Progress: LAN AI Chat UI (Vanilla + Vite)

_Last updated: 2025-04-21_

> **New (2026-07):** the repo now also hosts **Trend Desk**, an investment
> trading dashboard, at `/dashboard.html` — see `dashboard/README.md`.
> The chat app below is unchanged.

## What Has Been Accomplished
- **Sidebar now shows persistent chats:** The session list in the sidebar is populated from the backend `/sessions` endpoint. Creating/selecting sessions is fully integrated—no more mock data.
- **Model picker is populated:** The model picker dropdown is now dynamically loaded from the `/models` endpoint, reflecting available models in real time.
- **ChatView fully integrated:** Messages are loaded from the backend for each session, and message sending uses the real API. Streaming, markdown formatting (bold, bullets, newlines), and table/malformed markdown fixes are all live.
- **Persistent chat memory:** Chat context window increased to 30 messages. Both user and AI messages are now stored and displayed in order, supporting multi-turn conversations.
- **Table and math formatting fixes:** Markdown tables are auto-corrected for common AI formatting errors; math expressions in the format `[ \sqrt{100} ]` are auto-converted for KaTeX rendering (though full math rendering troubleshooting remains open).
- **KaTeX math rendering integration:** KaTeX is loaded in the frontend to support LaTeX-style math, but further troubleshooting is needed to ensure all math expressions render as expected.
- **Streaming duplication resolved:** Only the final, formatted AI response is shown after each turn; placeholder and duplicate messages are removed.
- **One-click startup:** Use `start-all.bat` to launch both backend (FastAPI) and frontend (Vite) servers in separate windows for easy development. The old manual startup sequence is deprecated.

## What Hasn't Worked
- **Vite CLI interactive prompts** cannot be used in the current environment (no terminal interaction possible).
- **Automated project creation via `npm create vite@latest`** fails due to inability to select a framework interactively.
- **KaTeX math rendering troubleshooting:** Math expressions are auto-converted and KaTeX is loaded, but further debugging is required to ensure all math displays correctly in both user and AI messages.

## Current State (2025-04-21)
- **Backend (FastAPI) and Frontend (Vite/JS) are both running and communicating.**
- **All core endpoints are implemented and reachable.**
- **Sessions and messages are stored in memory (no persistent DB yet).**
- **OpenAI API integration is active; vision support via o4-mini is stubbed for demo.**
- **Sidebar, model picker, and chat view are all fully integrated with backend APIs.**
- **Markdown rendering, streaming, and chat memory are robust.**

## Outstanding Tasks
- [OPEN] **KaTeX math rendering troubleshooting:** Math expressions are auto-converted and KaTeX is loaded, but further debugging is required to ensure all math displays correctly in both user and AI messages.
- Add persistent storage (e.g., SQLite) for sessions/messages.
- Add per-user data isolation (schema changes, user_id association on all data).
- Implement lightweight authentication (username + access key per user).
- Ensure files and sessions are only accessible by their owner.
- Polish UI, add error handling, and write user/developer documentation.
- Replace all remaining mock data and logic with real API calls and persistence.
- Update documentation and API surface to reflect new authentication and data isolation.

---

## How to Start the App (Quick Reference)

### 1. Start the App (One-Click)
```sh
start-all.bat
```
- This will launch both the backend (FastAPI) and frontend (Vite) servers in separate windows.
- Backend available at [http://localhost:8000/docs](http://localhost:8000/docs)
- Frontend available at [http://localhost:3000](http://localhost:3000)

### 2. Access the App
- Open your browser and go to [http://localhost:3000](http://localhost:3000)

### 3. Stopping the App
- Close both terminal windows, or press `CTRL+C` in each.

**Tip:** For LAN access, use your local IP (e.g., `http://192.168.x.x:3000`) and ensure firewall rules allow connections.

---

## Backend/Frontend Integration & Progress Log

### 2025-04-17
- Initial integration of backend and frontend; verified all endpoints reachable.
- Sessions/messages stored in memory; OpenAI API integration active.
- UI skeleton and modular JS components created and tested with mock data.
- Batch script for one-click startup introduced.

### 2025-04-21
- Sidebar now loads persistent sessions from backend.
- Model picker uses real `/models` endpoint.
- ChatView loads real message history and supports streaming, markdown, and table fixes.
- Chat memory window increased; both user and AI messages are persisted and shown in history.
- KaTeX math rendering integrated (open troubleshooting item).
- Streaming duplication bug fixed; only final formatted AI message is shown.
- Documentation and outstanding tasks updated to reflect new capabilities and next steps.

---
