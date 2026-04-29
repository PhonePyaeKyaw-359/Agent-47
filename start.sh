#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Starting Agent47 Services...${NC}"

# Ensure python environment
if [ ! -d ".venv" ]; then
    echo "Python environment '.venv' not found. Please run setup steps first."
    exit 1
fi

echo -e "${GREEN}Starting FastAPI backend on port 8000...${NC}"
.venv/bin/python -m uvicorn backend.api:app --host 0.0.0.0 --port 8000 --env-file .env &
BACKEND_PID=$!

echo -e "${GREEN}Starting Vite frontend on port 5173...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!

echo -e "${CYAN}Both services are running!${NC}"
echo -e "Frontend: http://localhost:5173"
echo -e "Backend:  http://localhost:8000"
echo -e "Press CTRL+C to stop both services."

# Wait for Ctrl+C
trap "echo 'Shutting down services...'; kill $BACKEND_PID $FRONTEND_PID; exit 0" SIGINT SIGTERM
wait
