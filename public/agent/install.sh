#!/usr/bin/env bash
# Instala o agente local do yt-dlp para o usuário atual (sem sudo).
set -euo pipefail

BASE="${AGENT_BASE_URL:-https://videodownloader.infosystema.cloud/agent}"
DIR="$HOME/.local/share/yt-dlp-agent"
BIN="$HOME/.local/bin"
UNIT_DIR="$HOME/.config/systemd/user"

command -v python3 >/dev/null || { echo "python3 não encontrado."; exit 1; }
command -v curl >/dev/null || { echo "curl não encontrado. Rode: sudo apt install curl"; exit 1; }

mkdir -p "$DIR" "$BIN" "$UNIT_DIR"

curl -fsSL "$BASE/yt-dlp-agent.py" -o "$DIR/yt-dlp-agent.py"

if [ ! -x "$BIN/yt-dlp" ]; then
  curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "$BIN/yt-dlp"
  chmod +x "$BIN/yt-dlp"
fi

cat > "$UNIT_DIR/yt-dlp-agent.service" <<'UNIT'
[Unit]
Description=Agente local do yt-dlp
After=network-online.target

[Service]
Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStartPre=-%h/.local/bin/yt-dlp -U
ExecStart=/usr/bin/python3 %h/.local/share/yt-dlp-agent/yt-dlp-agent.py
Restart=on-failure

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable yt-dlp-agent.service
systemctl --user restart yt-dlp-agent.service

command -v ffmpeg >/dev/null || echo "Aviso: instale o ffmpeg para mesclar vídeo/áudio: sudo apt install ffmpeg"
echo "Pronto! O agente está rodando. Recarregue o site."
echo "Para remover: systemctl --user disable --now yt-dlp-agent && rm -rf $DIR $UNIT_DIR/yt-dlp-agent.service"
