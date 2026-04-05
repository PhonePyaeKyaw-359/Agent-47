# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: build the Node.js MCP workspace server
#
# This is an npm workspaces project: all production deps (googleapis, zod,
# @modelcontextprotocol/sdk, etc.) are declared in workspace/package.json.
# The workspace-server sub-package only declares esbuild as a devDep.
# We must run `npm install` from the workspace ROOT so that npm hoists all
# deps into /build/node_modules, which node resolution walks up to find.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS mcp-builder

# Native modules (keytar) need python3 + build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy full workspace source first (npm install triggers `prepare` → `npm run build`,
# so the source files must exist before npm install runs)
COPY workspace/ .

# Install from workspace root — hoists all deps and runs the build via `prepare`
RUN npm install

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: runtime (Python 3.12 + Node.js 20 for spawning the MCP server)
#
# Python 3.12 is required: asyncio.wait_for() was rewritten in 3.12 to avoid
# creating an intermediate shielded Task, which fixes a anyio 4.x cancel-scope
# task-locality error (RuntimeError: Attempted to exit cancel scope in a
# different task than it was entered in) that occurs with the MCP stdio client.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim

# Install Node.js 20 (LTS) — needed at runtime to spawn the MCP child process
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python dependencies ──────────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── MCP server dist (copied from builder stage) ──────────────────────────────
# gemini-extension.json is required at runtime: paths.ts calls findProjectRoot()
# at module-load time, which traverses up from __dirname looking for this file.
# Without it the Node.js process throws before the MCP handshake can happen.
COPY --from=mcp-builder /build/gemini-extension.json workspace/gemini-extension.json
COPY --from=mcp-builder /build/workspace-server/dist/ workspace/workspace-server/dist/

# ── Application source ───────────────────────────────────────────────────────
COPY testing/ testing/

# ── Runtime ──────────────────────────────────────────────────────────────────
# Cloud Run injects PORT (default 8080). Never hard-code 8080.
ENV PORT=8080

CMD exec uvicorn testing.api:app --host 0.0.0.0 --port "${PORT}" --proxy-headers --forwarded-allow-ips='*'
