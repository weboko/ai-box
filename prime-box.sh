#!/usr/bin/env bash
set -euo pipefail

# Installs the heavy project toolchains (Nix with the Logos cache, Rust, cargo tools,
# RISC0) on demand instead of at image build time. Idempotent: anything already present
# is skipped, so re-running is cheap. Installs live in the container layer and are gone
# after a rebuild; run this again then.

# Two agent sessions priming at once would race on apt and the installers.
exec 9>/tmp/prime-box.lock
flock 9

installed=()

apt_pkgs=(curl ca-certificates git xz-utils build-essential pkg-config libssl-dev)
missing=()
for p in "${apt_pkgs[@]}"; do
  dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "prime: apt install ${missing[*]}"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${missing[@]}"
  rm -rf /var/lib/apt/lists/*
  installed+=("apt: ${missing[*]}")
fi

if ! command -v nix >/dev/null 2>&1; then
  echo "prime: installing nix"
  curl -fsSL https://install.determinate.systems/nix | sh -s -- install linux \
    --no-confirm \
    --init none \
    --extra-conf "experimental-features = nix-command flakes" \
    --extra-conf "extra-substituters = https://cache.nix.logos.co/public" \
    --extra-conf "extra-trusted-public-keys = public:l4HrXgL4nw246+LBh2SOJyhz64BoGegOYLheT/iIAPU= public:Z1wyVBEx8PHbXujYB52Mysv9Rd8rWIhyQ3bQyef9yy4=" \
    --extra-conf "fallback = true" \
    --extra-conf "max-jobs = auto" \
    --extra-conf "sandbox = false"
  installed+=("nix")
fi

if ! command -v rustup >/dev/null 2>&1; then
  echo "prime: installing rustup"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --no-modify-path --profile default --default-toolchain 1.97.1
  installed+=("rust 1.97.1, 1.94.0, nightly")
fi
# Each of these is a no-op when already satisfied.
rustup toolchain install 1.94.0 --profile default
rustup toolchain install nightly --profile minimal --component rustfmt
rustup component add clippy rustfmt
rustup target add wasm32-unknown-unknown

if ! command -v cargo-binstall >/dev/null 2>&1; then
  echo "prime: installing cargo-binstall"
  curl -L --proto '=https' --tlsv1.2 -sSf \
    https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
  installed+=("cargo-binstall, just, cargo-nextest, taplo, cargo-machete, cargo-deny, cargo-leptos")
fi
# binstall skips anything already installed at the requested version.
cargo binstall --no-confirm \
  just@1.56.0 \
  cargo-nextest@0.9.140 \
  taplo-cli@0.10.0 \
  cargo-machete@0.9.2 \
  cargo-deny@0.20.2 \
  cargo-leptos

arch="$(uname -m)"
if [ "$arch" != "x86_64" ]; then
  echo "prime: RISC0 skipped: rzup does not support linux/$arch" >&2
elif ! command -v r0vm >/dev/null 2>&1; then
  echo "prime: installing risc0"
  curl -L https://risczero.com/install | bash
  install -m 0755 "$HOME/.risc0/bin/rzup" /usr/local/bin/rzup
  rm -rf "$HOME/.risc0"
  rzup install rust 1.94.1
  rzup install cpp 2024.1.5
  rzup install r0vm 3.0.5
  rzup install cargo-risczero 3.0.5
  installed+=("risc0 (r0vm 3.0.5, cargo-risczero 3.0.5)")
fi

if [ "${#installed[@]}" -gt 0 ]; then
  for item in "${installed[@]}"; do
    echo "- $(date -u +%F) $item — installed by ~/prime.sh" >> "$HOME/installed-dependencies.md"
  done
fi

echo
echo "prime: done"
for cmd in "nix --version" "rustc --version" "cargo --version" "just --version" \
           "cargo nextest --version" "r0vm --version"; do
  printf '  %-24s %s\n' "${cmd%% --version}" "$($cmd 2>/dev/null | head -1 || echo 'not installed')"
done
