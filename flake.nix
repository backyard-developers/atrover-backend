{
  description = "Rover Control Server development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_20
            nodePackages.npm
            redis
            jq
          ];

          shellHook = ''
            echo "Rover Control Server Dev Environment"
            echo "Node.js: $(node --version)"
            echo ""
            echo "Commands:"
            echo "  npm install    - Install dependencies"
            echo "  npm run dev    - Start development server"
            echo "  redis-server   - Start Redis locally"
          '';
        };
      }
    );
}
