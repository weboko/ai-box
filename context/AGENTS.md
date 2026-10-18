## Dependencies

Install any dependency you need to work on a project without asking for confirmation.

After each install, append a line to `$HOME/installed-dependencies.md` recording what you
installed, the version, and why. Create the file if it does not exist.

## Priming the machine

This box starts without Nix, Rust (rustup, cargo, just, nextest, ...) or RISC0. Before
working on a project that needs any of them — a `flake.nix`, `Cargo.toml`,
`rust-toolchain*`, risc0 crates, or a "command not found" for nix/cargo/just/r0vm — run
`~/prime.sh` and wait for it to finish.

It is idempotent: anything already installed is skipped, so re-running is cheap. Its
installs do not survive a container rebuild, so run it again if the tools have gone missing.
RISC0 is skipped on arm64 hosts, where rzup is unsupported.
