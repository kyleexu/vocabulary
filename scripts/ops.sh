#!/usr/bin/env bash
# 词汇训练器 VPS 运维脚本：构建、前台/后台启动、systemd 常驻。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPS_DIR="$ROOT/.ops"
PID_FILE="$OPS_DIR/vocabulary.pid"
LOG_FILE="$OPS_DIR/vocabulary.log"
UNIT_NAME="${UNIT_NAME:-vocabulary}"
UNIT_PATH="/etc/systemd/system/${UNIT_NAME}.service"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-4173}"

mkdir -p "$OPS_DIR"

die() {
  echo "错误: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "未找到命令: $1"
}

node_bin() {
  command -v node
}

vite_bin() {
  local bin="$ROOT/node_modules/.bin/vite"
  [[ -x "$bin" ]] || die "未找到 vite，请先执行: $0 setup"
  echo "$bin"
}

is_systemd_active() {
  [[ -f "$UNIT_PATH" ]] && command -v systemctl >/dev/null 2>&1
}

pid_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  tr -d '[:space:]' <"$PID_FILE"
}

usage() {
  cat <<EOF
用法: $0 <命令>

命令:
  setup              npm install + 生产构建
  start              后台启动 preview（已装 systemd 则走 systemctl）
  start-fg           前台启动（调试用）
  stop               停止
  restart            先停再启
  status             进程 / 端口状态
  logs               看日志（systemd 走 journalctl，否则看 .ops/vocabulary.log）
  update             git pull（若有）+ setup + restart
  systemd-install    安装并启用开机自启（需 sudo）
  systemd-uninstall  停用并删除 unit（需 sudo）

环境变量:
  HOST       监听地址，默认 0.0.0.0
  PORT       端口，默认 4173
  UNIT_NAME  systemd 服务名，默认 vocabulary

示例:
  ./scripts/ops.sh setup
  PORT=8080 ./scripts/ops.sh start
  ./scripts/ops.sh systemd-install
EOF
}

cmd_setup() {
  need_cmd node
  need_cmd npm
  cd "$ROOT"
  echo "==> npm install"
  npm install
  echo "==> npm run build"
  npm run build
  echo "完成。产物在 dist/，词库 API 仍由 vite preview 提供。"
}

cmd_start_fg() {
  need_cmd node
  [[ -d "$ROOT/dist" ]] || die "还没有 dist/，请先: $0 setup"
  cd "$ROOT"
  echo "前台启动: http://${HOST}:${PORT}"
  echo "词库读写依赖此进程，Ctrl+C 即停止。"
  exec "$(node_bin)" "$(vite_bin)" preview --host "$HOST" --port "$PORT"
}

cmd_start() {
  if is_systemd_active; then
    echo "==> systemctl start ${UNIT_NAME}"
    sudo systemctl start "$UNIT_NAME"
    sudo systemctl --no-pager --full status "$UNIT_NAME" || true
    return
  fi

  if pid_running "$(read_pid 2>/dev/null || true)"; then
    echo "已在运行，pid=$(read_pid)  日志: $LOG_FILE"
    return
  fi

  need_cmd node
  [[ -d "$ROOT/dist" ]] || die "还没有 dist/，请先: $0 setup"
  cd "$ROOT"
  nohup "$(node_bin)" "$(vite_bin)" preview --host "$HOST" --port "$PORT" >>"$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" >"$PID_FILE"
  sleep 0.4
  if pid_running "$pid"; then
    echo "已后台启动 pid=$pid"
    echo "访问: http://<VPS_IP>:${PORT}"
    echo "日志: $LOG_FILE"
  else
    rm -f "$PID_FILE"
    die "启动失败，看日志: $LOG_FILE"
  fi
}

cmd_stop() {
  if is_systemd_active; then
    echo "==> systemctl stop ${UNIT_NAME}"
    sudo systemctl stop "$UNIT_NAME"
    return
  fi

  local pid
  pid="$(read_pid 2>/dev/null || true)"
  if pid_running "$pid"; then
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      pid_running "$pid" || break
      sleep 0.2
    done
    if pid_running "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    echo "已停止 pid=$pid"
  else
    echo "没有在跑的后台进程"
  fi
  rm -f "$PID_FILE"
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_status() {
  echo "项目目录: $ROOT"
  echo "监听:     ${HOST}:${PORT}"
  if is_systemd_active; then
    echo "模式:     systemd (${UNIT_NAME})"
    sudo systemctl --no-pager --full status "$UNIT_NAME" || true
  else
    local pid
    pid="$(read_pid 2>/dev/null || true)"
    if pid_running "$pid"; then
      echo "模式:     nohup  pid=$pid"
    else
      echo "模式:     nohup  未运行"
    fi
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | grep -E ":${PORT}\\b" || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true
  fi
}

cmd_logs() {
  if is_systemd_active; then
    sudo journalctl -u "$UNIT_NAME" -f
    return
  fi
  touch "$LOG_FILE"
  echo "日志: $LOG_FILE"
  tail -n 200 -f "$LOG_FILE"
}

cmd_update() {
  cd "$ROOT"
  if [[ -d .git ]] && command -v git >/dev/null 2>&1; then
    echo "==> git pull"
    git pull --ff-only
  else
    echo "跳过 git pull（不是 git 仓库或未安装 git）"
  fi
  cmd_setup
  cmd_restart
}

write_unit() {
  local node vite user
  node="$(node_bin)"
  vite="$(vite_bin)"
  user="$(id -un)"
  cat <<EOF
[Unit]
Description=Vocabulary Trainer
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${ROOT}
ExecStart=${node} ${vite} preview --host ${HOST} --port ${PORT}
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
}

cmd_systemd_install() {
  need_cmd node
  need_cmd sudo
  [[ -d "$ROOT/dist" ]] || die "还没有 dist/，请先: $0 setup"
  cmd_stop || true
  echo "==> 写入 ${UNIT_PATH}"
  write_unit | sudo tee "$UNIT_PATH" >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable --now "$UNIT_NAME"
  sudo systemctl --no-pager --full status "$UNIT_NAME" || true
  echo
  echo "已启用开机自启。之后用: $0 start|stop|restart|status|logs"
}

cmd_systemd_uninstall() {
  need_cmd sudo
  if [[ -f "$UNIT_PATH" ]]; then
    sudo systemctl disable --now "$UNIT_NAME" 2>/dev/null || true
    sudo rm -f "$UNIT_PATH"
    sudo systemctl daemon-reload
    echo "已卸载 systemd 服务 ${UNIT_NAME}"
  else
    echo "没有 ${UNIT_PATH}"
  fi
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    setup) cmd_setup ;;
    start) cmd_start ;;
    start-fg) cmd_start_fg ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    update) cmd_update ;;
    systemd-install) cmd_systemd_install ;;
    systemd-uninstall) cmd_systemd_uninstall ;;
    -h|--help|help|"") usage ;;
    *)
      usage
      die "未知命令: $cmd"
      ;;
  esac
}

main "$@"
