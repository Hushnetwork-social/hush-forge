# Forge — Token Launcher

**Forge** is a standalone web application for creating and managing NEP-17 tokens on the Neo N3 blockchain. Deployed at [forge.hushnetwork.social](https://forge.hushnetwork.social).

## Getting Started

Install dependencies:

```bash
npm install
```

Copy environment variables:

```bash
cp .env.local.example .env.local
# Edit .env.local with your Neo RPC URL and contract hash
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test:run` | Run unit tests (Vitest) |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run E2E tests (Playwright) |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **State**: Zustand 5
- **Unit Tests**: Vitest 4 + @testing-library/react
- **E2E Tests**: Playwright + playwright-bdd (Gherkin)
- **Blockchain**: Neo N3 via dAPI (NeoLine / OneGate)

## Environment Variables

See `.env.local.example` for required configuration.
