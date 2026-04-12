# Contributing to SwarmMind

Thank you for your interest in contributing! This guide covers everything you need
to get started.

## Prerequisites

- **Node.js 20** (see `.nvmrc`; use `nvm use` if you have nvm installed)
- **npm** (bundled with Node)

## Setup

```bash
git clone https://github.com/vortsghost2025/SwarmMind-Self-Optimizing-Multi-Agent-AI-System.git
cd SwarmMind-Self-Optimizing-Multi-Agent-AI-System
npm ci           # install exact versions from lockfile
```

## Running the Demo

```bash
npm start        # runs src/app.js and prints the demo output
```

Open `index.html` in a browser for the web UI demo (no server required).

## Development Workflow

### Linting

```bash
npm run lint     # ESLint across src/ and tests/
```

Fix auto-fixable issues with:

```bash
npx eslint src tests --fix
```

### Testing

```bash
npm test         # runs Jest with coverage; exits cleanly after all tests
```

Tests live in `tests/`. Each file mirrors the source module it covers:

| Test file | Covers |
| --------- | ------ |
| `tests/agent.test.js` | `src/core/agent.js` |
| `tests/scalingManager.test.js` | `src/core/scalingManager.js` |
| `tests/traceViewer.test.js` | `src/ui/traceViewer.js` |

Add a test file for every new module you introduce.

### Security Audit

```bash
npm audit --audit-level=moderate
```

## Pull Request Guidelines

1. **Fork** the repository and create your branch from `main`.
2. Make sure `npm run lint` and `npm test` both pass before opening a PR.
3. Write or update tests for any behaviour you change or add.
4. Keep commits small and focused; reference issues where relevant.
5. Follow the existing code style (2-space indentation, CommonJS `require`).

## Reporting Bugs

Open a [GitHub issue](https://github.com/vortsghost2025/SwarmMind-Self-Optimizing-Multi-Agent-AI-System/issues)
and include:

- A minimal reproduction case
- The Node.js version you are using (`node --version`)
- The exact error or unexpected output

For security vulnerabilities, see [SECURITY.md](./SECURITY.md) instead.
