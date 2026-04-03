# Workspace AI — Multi-Agent Personal Assistant

A multi-agent AI system built with Google ADK and Gemini that manages tasks, schedules, and notes by coordinating specialist sub-agents across Google Workspace and a local SQLite database.

## Architecture

```
orchestrator (root_agent)
├── calendar_agent   — Google Calendar via workspace MCP server
├── tasks_agent      — Task CRUD via SQLite
└── notes_agent      — Notes CRUD via SQLite
```

## Setup

### 1. Prerequisites

- Python 3.11+
- Node.js 20+
- A Google Cloud project with billing enabled
- `gcloud` CLI authenticated

### 2. Clone the workspace MCP server

```bash
git clone https://github.com/gemini-cli-extensions/workspace workspace
```

### 3. Configure Google Cloud OAuth

```bash
cd workspace
gcloud config set project YOUR_PROJECT_ID
bash scripts/setup-gcp.sh
cd ..
```

The script will output a `WORKSPACE_CLIENT_ID` and `WORKSPACE_CLOUD_FUNCTION_URL`.

### 3. Environment

```bash
cp .env.example testing/.env
# Fill in GOOGLE_CLOUD_PROJECT, WORKSPACE_CLIENT_ID, WORKSPACE_CLOUD_FUNCTION_URL
```

### 4. Python environment

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 5. Build the workspace MCP server

```bash
cd workspace
npm install
npm run build
cd ..
```

### 6. Authenticate with Google (once per machine)

```bash
cd workspace/workspace-server
node dist/headless-login.js
# Browser opens — sign in with your Google account
cd ../..
```

### 7. Run

**Dev UI:**
```bash
adk web
```

**REST API:**
```bash
uvicorn testing.api:app --host 0.0.0.0 --port 8000
```

API endpoints:
- `GET  /health`
- `POST /run` — `{"message": "What's on my calendar today?", "session_id": ""}`
- `DELETE /sessions/{session_id}`

## Example prompts

- *"What meetings do I have today?"*
- *"Create a task: Review PR by Friday, high priority"*
- *"Schedule a standup tomorrow at 10am with alice@example.com"*
- *"Save a note: team offsite ideas — tags: work,planning"*
- *"Show all pending tasks"*
