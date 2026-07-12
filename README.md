# Mailroute

Find likely work email addresses from a person's name and company domain.

Mailroute ranks common email patterns, looks up the domain's preferred MX server, and checks candidates through SMTP during local development.

> [!IMPORTANT]
> SMTP mailbox checks only run on the local development server. Deployment is currently disabled because hosted Workers cannot connect to SMTP port 25.

## Features

- Ranks one best guess and two fallback work email patterns from a name and domain
- Validates the company domain and resolves its preferred MX host
- Provides one-click copying for generated addresses
- Runs locally with Vite
- Shares UI components through a pnpm workspace package

## Tech stack

- [TanStack Start](https://tanstack.com/start) and React
- [Tailwind CSS](https://tailwindcss.com) and shadcn/ui
- [Cloudflare Workers](https://workers.cloudflare.com)
- [Alchemy](https://alchemy.run) for infrastructure and deployment
- [pnpm](https://pnpm.io) workspaces

## Getting started

### Prerequisites

- Node.js 22 or newer
- pnpm 10.13.1

Install the workspace dependencies:

```bash
pnpm install
```

Start the local development server:

```bash
pnpm dev:web
```

The web app is available at [http://localhost:3001](http://localhost:3001).

No application environment variables are currently required.

## Available commands

| Command | Description |
| --- | --- |
| `pnpm dev:web` | Start only the Vite web application |
| `pnpm build` | Build workspace packages that define a build script |
| `pnpm check-types` | Check TypeScript in packages that define the script |
| `pnpm run deploy` | Print why deployment is currently disabled |
| `pnpm destroy` | Remove the deployed Cloudflare resources |

## Deployment

Deployment is disabled while mailbox checks depend on local SMTP access. Run `pnpm run deploy` to see this reminder.

Remove the deployed resources with:

```bash
pnpm destroy
```

## Project structure

```text
email-finder/
├── apps/
│   └── web/          # TanStack Start application and API route
├── packages/
│   ├── config/       # Shared TypeScript configuration
│   ├── env/          # Environment validation
│   ├── infra/        # Alchemy and Cloudflare deployment
│   └── ui/           # Shared UI components and styles
├── package.json
└── pnpm-workspace.yaml
```

The email finder endpoint lives at `apps/web/src/routes/api.find-email.ts`. It normalizes the input, queries Cloudflare's DNS-over-HTTPS API for MX records, and returns a ranked shortlist of common email formats.
