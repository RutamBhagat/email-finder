# Mailroute

Find likely work email addresses from a person's name and company domain.

Mailroute generates common email patterns, looks up the domain's preferred MX server through Cloudflare DNS, and presents the results in a simple interface. It runs as a TanStack Start application on Cloudflare Workers.

> [!IMPORTANT]
> Mailroute generates likely addresses; it does not confirm that a mailbox exists or can receive mail. Cloudflare Workers cannot connect to SMTP port 25.

## Features

- Generates common work email patterns from a first name, last name, and domain
- Validates the company domain and resolves its preferred MX host
- Provides one-click copying for generated addresses
- Runs locally with Vite and deploys to Cloudflare with Alchemy
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

Start the application with the Cloudflare development environment:

```bash
pnpm dev
```

For the Vite development server without Alchemy, run:

```bash
pnpm dev:web
```

The web app is available at [http://localhost:3001](http://localhost:3001).

No application environment variables are currently required.

## Available commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start workspace development through Alchemy |
| `pnpm dev:web` | Start only the Vite web application |
| `pnpm build` | Build workspace packages that define a build script |
| `pnpm check-types` | Check TypeScript in packages that define the script |
| `pnpm deploy` | Build and deploy the application to Cloudflare |
| `pnpm destroy` | Remove the deployed Cloudflare resources |

## Deploy to Cloudflare

Authenticate Alchemy with a Cloudflare account, then deploy from the repository root:

```bash
pnpm deploy
```

Alchemy uses [`packages/infra/alchemy.run.ts`](packages/infra/alchemy.run.ts) to build `apps/web` and provision the Cloudflare Worker. The default stage is based on your local username; pass Alchemy configuration through the infrastructure package when you need a named production stage.

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

The email finder endpoint lives at `apps/web/src/routes/api.find-email.ts`. It normalizes the input, queries Cloudflare's DNS-over-HTTPS API for MX records, and returns a deduplicated list of common email formats.
