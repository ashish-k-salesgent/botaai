#!/bin/bash
# BotAAI dev servers — backend :8085, frontend :3005, embed demo :3010
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$ROOT/.dev-pids"
SCREEN_BACKEND="botaai-backend"
SCREEN_FRONTEND="botaai-frontend"
SCREEN_EMBED="botaai-embed"

stop_all() {
  echo "Stopping..."
  screen -S "$SCREEN_BACKEND" -X quit 2>/dev/null || true
  screen -S "$SCREEN_FRONTEND" -X quit 2>/dev/null || true
  screen -S "$SCREEN_EMBED" -X quit 2>/dev/null || true
  [ -f "$PIDFILE" ] && while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$PIDFILE"
  rm -f "$PIDFILE"
  lsof -ti:8085,3005,3010 | xargs kill -9 2>/dev/null || true
}

start_backend() {
  cd "$ROOT/backend"
  if [ ! -d .venv ]; then
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
  fi
  screen -dmS "$SCREEN_BACKEND" bash -lc "cd '$ROOT/backend' && .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8085"
}

start_frontend() {
  cd "$ROOT/frontend"
  if [ ! -d node_modules ]; then
    npm install --legacy-peer-deps
    npm install ajv@8 --legacy-peer-deps
  fi
  screen -dmS "$SCREEN_FRONTEND" bash -lc "cd '$ROOT/frontend' && PORT=3005 BROWSER=none npm start"
}

start_embed() {
  screen -dmS "$SCREEN_EMBED" bash -lc "cd '$ROOT/embed-demo' && python3 -m http.server 3010"
}

wait_healthy() {
  for i in $(seq 1 30); do
    FE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 1 http://127.0.0.1:3005/login 2>/dev/null || echo 0)
    BE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 1 http://127.0.0.1:8085/api/ 2>/dev/null || echo 0)
    EM=$(curl -s -o /dev/null -w "%{http_code}" --max-time 1 http://127.0.0.1:3010/ 2>/dev/null || echo 0)
    [ "$FE" = "200" ] && [ "$BE" = "200" ] && [ "$EM" = "200" ] && return 0
    sleep 2
  done
  return 1
}

case "${1:-start}" in
  stop)
    stop_all
    echo "Stopped."
    exit 0
    ;;
  status)
    echo "Backend (8085):  $(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:8085/api/ 2>/dev/null || echo down)"
    echo "Frontend (3005): $(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3005/login 2>/dev/null || echo down)"
    echo "Embed demo (3010): $(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3010/ 2>/dev/null || echo down)"
    screen -ls 2>/dev/null | grep botaai || echo "No screen sessions"
    exit 0
    ;;
  logs)
    echo "=== backend ===" && screen -S "$SCREEN_BACKEND" -X hardcopy /tmp/botaai-be-screen.log 2>/dev/null && tail -15 /tmp/botaai-be-screen.log 2>/dev/null || echo "(none)"
    echo "=== frontend ===" && screen -S "$SCREEN_FRONTEND" -X hardcopy /tmp/botaai-fe-screen.log 2>/dev/null && tail -15 /tmp/botaai-fe-screen.log 2>/dev/null || echo "(none)"
    exit 0
    ;;
  detached|start)
    stop_all
    echo "Starting backend on http://localhost:8085 ..."
    start_backend
    echo "Starting frontend on http://localhost:3005 ..."
    start_frontend
    echo "Starting embed demo on http://localhost:3010 ..."
    start_embed
    echo "Waiting for servers..."
    if wait_healthy; then
      echo ""
      echo "✓ Ready!"
      echo "  BotAAI admin:  http://localhost:3005/login"
      echo "  Embed demo:    http://localhost:3010  (sign up any user — test widget)"
      echo "  Backend API:   http://localhost:8085/api"
      echo "  Widget script: http://localhost:8085/widget.js"
      echo ""
      echo "  Stop:   ./start-dev.sh stop"
      echo "  Status: ./start-dev.sh status"
    else
      echo "Servers started but not all healthy. Check: ./start-dev.sh status"
      exit 1
    fi
    ;;
  foreground)
    stop_all
    cd "$ROOT/backend" && .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8085 &
    echo $! >> "$PIDFILE"
    cd "$ROOT/frontend" && PORT=3005 BROWSER=none npm start &
    echo $! >> "$PIDFILE"
    cd "$ROOT/embed-demo" && python3 -m http.server 3010 &
    echo $! >> "$PIDFILE"
    trap 'stop_all; exit 0' INT TERM
    wait
    ;;
  *)
    echo "Usage: $0 [start|detached|foreground|stop|status|logs]"
    exit 1
    ;;
esac
