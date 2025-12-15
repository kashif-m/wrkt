{
  description = "Workout tracker dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    oh-my-zsh.url = "github:ohmyzsh/ohmyzsh";
  };

  outputs = { self, nixpkgs, flake-utils, oh-my-zsh }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          name = "workout-tracker-shell";

          packages = with pkgs; [
            cargo
            rustc
            rustfmt
            clippy
            pkg-config
            openssl
            sqlite
            ripgrep
            fd
            jq
            git
            tree
            gnupg
            starship
            zoxide
            exa
            bat
            zsh
          ];

          shellHook = ''
            export SHELL=${pkgs.zsh}/bin/zsh
            export ZDOTDIR=$PWD/.nix-zsh
            mkdir -p $ZDOTDIR
            if [ ! -d "$ZDOTDIR/.oh-my-zsh" ]; then
              cp -r ${oh-my-zsh}/share/oh-my-zsh $ZDOTDIR/.oh-my-zsh
            fi
            if [ ! -f "$ZDOTDIR/.zshrc" ]; then
              cat <<'RC' > $ZDOTDIR/.zshrc
            export ZSH="$ZDOTDIR/.oh-my-zsh"
            ZSH_THEME="agnoster"
            plugins=(git z)
            source $ZSH/oh-my-zsh.sh
            eval "$(starship init zsh)"
            eval "$(zoxide init zsh)"
            RC
            fi
            echo "Loaded workout tracker dev shell"
          '';
        };
      }
    );
}
