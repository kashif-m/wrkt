{
  description = "Workout tracker dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    fenix.url = "github:nix-community/fenix";
  };

  outputs = { self, nixpkgs, flake-utils, fenix }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        fenixPkgs = fenix.packages.${system};
        rustComponents = [
          fenixPkgs.stable.rustc
          fenixPkgs.stable.cargo
          fenixPkgs.stable.clippy
          fenixPkgs.stable.rustfmt
          fenixPkgs.stable.rust-src
          fenixPkgs.targets."aarch64-apple-ios".stable.rust-std
          fenixPkgs.targets."aarch64-apple-ios-sim".stable.rust-std
          fenixPkgs.targets."aarch64-linux-android".stable.rust-std
          fenixPkgs.targets."armv7-linux-androideabi".stable.rust-std
        ];
        rustToolchain = fenixPkgs.combine rustComponents;
        rustAnalyzer = fenixPkgs.latest.rust-analyzer;
        rustSrc = fenixPkgs.stable.rust-src;
      in {
        devShells.default = pkgs.mkShell {
          name = "workout-tracker-shell";

          packages = with pkgs; [
            rustToolchain
            rustAnalyzer
            nodejs
            jdk17
            gradle
            cmake
            ninja
            llvm
            cargo-ndk
            android-tools
            watchman
            zsh
            git
            zoxide
            zsh-syntax-highlighting
            zsh-autosuggestions
            # Formatting tools
            clang-tools       # clang-format for C++/Obj-C
            ktlint            # Kotlin formatter
            just              # Command runner
          ];

          shellHook = ''
            export SHELL=${pkgs.zsh}/bin/zsh
            export PATH=${rustToolchain}/bin:$PATH
            export ZDOTDIR=$PWD/.nix-zsh
            export RUST_SRC_PATH=${rustSrc}/lib/rustlib/src/rust
            mkdir -p $ZDOTDIR
            if [ ! -f "$ZDOTDIR/.zshrc" ]; then
              cat <<'RC' > $ZDOTDIR/.zshrc
            autoload -Uz colors && colors
            autoload -Uz promptinit && promptinit
            autoload -Uz vcs_info
            setopt prompt_subst
            setopt autocd
            setopt inc_append_history
            bindkey -e
            eval "$(zoxide init zsh)"
            source ${pkgs.zsh-syntax-highlighting}/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
            source ${pkgs.zsh-autosuggestions}/share/zsh-autosuggestions/zsh-autosuggestions.zsh
            zstyle ':vcs_info:*' enable git
            zstyle ':vcs_info:git:*' check-for-changes true
            zstyle ':vcs_info:git:*' stagedstr '+'
            zstyle ':vcs_info:git:*' unstagedstr '*'
            zstyle ':vcs_info:git:*' formats '%F{magenta}[%b%u%a]%f'
            precmd() { vcs_info }
            PROMPT='%F{cyan}%n%f %F{yellow}%~%f ''${vcs_info_msg_0_:-} %# '
            alias l='ls -lah'
            RC
            fi
            # if [ -z "$ZSH_NAME" ] && [ -t 1 ]; then
              # exec ${pkgs.zsh}/bin/zsh
            # fi
            echo "Loaded workout tracker dev shell"
          '';
        };
      }
    );
}
