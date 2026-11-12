# slot-web

Web client for the [MeddSlot API](../slot-api) — browse available appointment
slots, book one, and look up / cancel your bookings.

## Prerequisites

- The MeddSlot API running on `http://localhost:8000` (from `~/Projects/slot-api`:
  `docker compose up -d db api`, or `uv run uvicorn slot_api.main:app`)
- The API must allow this origin via `CORS_ORIGINS` in its `.env`, e.g.
  `CORS_ORIGINS=http://localhost:5173`
- Your API key (the `API_KEY` value from the API's `.env`)

## Run

```sh
npm install
npm run dev
```

Then open http://localhost:5173, paste your API key in the **Connection** panel
(it is stored only in this browser's localStorage), and you're set.

The API base URL defaults to `http://localhost:8000` and can be overridden with
`VITE_API_BASE_URL` (see `.env.example`).

## Features

- **Connection** — paste the `X-API-Key` value; kept in localStorage, sent on
  every request.
- **Available slots** — list slots, filter by provider, book one with name +
  email. Bookings are submitted with an `Idempotency-Key` header so a retried
  submission can never double-book a slot.
- **My bookings** — look up bookings by email (case-insensitive, cursor
  pagination via *Load more*) and cancel confirmed bookings.
- Friendly handling of the API's error codes: 401 (bad key), 400 (slot
  already started), 409 (slot just taken), 429 (rate limit, honours
  `Retry-After`).

## Stack

React 19 + Vite + TypeScript. No UI framework — plain CSS in `src/index.css`.

## Building

```sh
npm run build   # type-checks then bundles to dist/
npm run preview # serve the production build on :4173
```
