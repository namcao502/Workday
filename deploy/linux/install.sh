#!/bin/sh
# Build Workday and install it as a systemd user service.
# Usage: deploy/linux/install.sh [repo-dir]   (default: the parent of deploy/)
set -eu

script_dir=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "${1:-$script_dir/../..}" && pwd)

node_major=$(node -v | sed 's/^v//; s/\..*//')
if [ "$node_major" -lt 22 ]; then
  echo "Node 22 or newer is required (found $(node -v))." >&2
  exit 1
fi

cd "$repo"
npm ci
npm run build

unit_dir="$HOME/.config/systemd/user"
mkdir -p "$unit_dir"
sed "s|^WorkingDirectory=.*|WorkingDirectory=$repo|" "$script_dir/workday.service" > "$unit_dir/workday.service"

systemctl --user daemon-reload
systemctl --user enable --now workday

echo "Workday is running at http://127.0.0.1:4870"
echo
echo "Next steps:"
echo "  loginctl enable-linger \$USER        # keep the service running when you are logged out"
echo "  systemctl --user import-environment DISPLAY WAYLAND_DISPLAY"
echo "                                       # TSC / Teams sign-in opens a visible Chrome"
echo "  journalctl --user -u workday -f      # follow the log"
