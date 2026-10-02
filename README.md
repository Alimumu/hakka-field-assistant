# Hakka Field Assistant

A minimal fieldwork prototype for Hakka dialect investigations, designed for a 1-month hackathon workflow with a single developer and one linguistics researcher.

## Goals

- Manage fieldwork projects and speakers.
- Create and import investigation items.
- Record audio from the browser microphone.
- Store local metadata and export project packages.
- Use an AI assistant (DeepSeek-ready adapter) for note summarization and review suggestions.
- Enable offline-first usage without cloud dependency.

## Tech stack

- React
- TypeScript
- Vite
- IndexedDB-ready local storage structure
- JSZip for export
- DeepSeek adapter scaffold

## Getting started

1. Install dependencies:

   npm install

2. Run the app:

   npm run dev

3. Open the local URL shown in the terminal.

## Suggested workflow

1. Create a project.
2. Enter the location and dialect area.
3. Add speakers.
4. Add fieldwork items or import CSV.
5. Record the selected item.
6. Mark valid or retake.
7. Use AI note summarization to improve workflow.
8. Export the project as a ZIP bundle.

## Important note

This is a prototype and intentionally prioritizes a minimal viable workflow over full phonetic analysis.
The AI integration is intentionally scaffolded so it can later be upgraded to a DeepSeek backend proxy without changing the frontend UI.

## Files to extend later

- `src/lib/ai.ts` for the AI adapter and model wrapper.
- `src/lib/storage.ts` for local persistence and data model updates.
- `src/App.tsx` for project workflow UI.

## Roadmap

- Stable field recording and local saving.
- AI-assisted note review.
- Better export format.
- CSV import, project recovery, and stronger data validation.
- Full DeepSeek backend proxy and export formatting.
