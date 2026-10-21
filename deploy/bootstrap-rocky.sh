#!/usr/bin/env bash
set -euo pipefail
umask 027
test "$(id -u)" = 0
test "$(uname -m)" = x86_64
dnf install -y curl tar xz git gcc-c++ make python3 dnf-plugins-core firewalld

# Match the tested local runtime; verify the archive before extracting it.
NODE_VERSION=24.16.0
install -d -m 0755 /opt/sdj /opt/sdj/tools
if ! test -x "/opt/sdj/tools/node-v${NODE_VERSION}-linux-x64/bin/node"; then
  download_dir=$(mktemp -d /opt/sdj/tools/download.XXXXXX)
  cd "$download_dir"
  curl --fail --silent --show-error --location --retry 3 -O "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
  curl --fail --silent --show-error --location --retry 3 -O "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  grep " node-v${NODE_VERSION}-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum --check -
  tar -xJf "node-v${NODE_VERSION}-linux-x64.tar.xz" -C /opt/sdj/tools
fi
ln -sfn "/opt/sdj/tools/node-v${NODE_VERSION}-linux-x64" /opt/sdj/node
chmod -R a+rX "/opt/sdj/tools/node-v${NODE_VERSION}-linux-x64"
export PATH=/opt/sdj/node/bin:$PATH
npm install --global pnpm@12.11.2 --ignore-scripts --no-audit --no-fund

id sdj >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/sdj --shell /sbin/nologin sdj
id sdj-gateway >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/sdj-gateway --shell /sbin/nologin sdj-gateway
id sdj-proxy >/dev/null 2>&1 || useradd --system --no-create-home --shell /sbin/nologin sdj-proxy
install -d -m 0755 /opt/sdj/releases /opt/sdj/shared /etc/sdj
install -d -m 0750 -o sdj-gateway -g sdj-gateway /var/lib/sdj-gateway

# A small swap reserve allows dependency installation on the 2 GB plan.
if ! swapon --show=NAME --noheadings | grep -q .; then
  if ! test -e /swapfile-sdj; then
    dd if=/dev/zero of=/swapfile-sdj bs=1M count=2048 status=none
    chmod 600 /swapfile-sdj
    mkswap /swapfile-sdj
  fi
  swapon /swapfile-sdj
  grep -q '^/swapfile-sdj ' /etc/fstab || printf '/swapfile-sdj none swap sw 0 0\n' >> /etc/fstab
fi

if ! command -v caddy >/dev/null; then
  dnf copr enable -y @caddy/caddy
  dnf install -y caddy
fi
# Keep SSH allowed before enabling the firewall. Application ports remain private.
firewall-offline-cmd --add-service=ssh
firewall-offline-cmd --add-service=http
firewall-offline-cmd --add-service=https
systemctl enable --now firewalld
printf 'SDJ_BOOTSTRAP_READY\n'
