Feature: Detect Cargo commands for Rust projects
  Scenario: A locked Cargo project gets setup, fix and checks without clippy or protection
    When coord-detect-cargo: Detect receives:
      """
      {"Files":{"Cargo.toml":"[package]\nname = \"demo\"\n","Cargo.lock":"version = 3\n"},"Tracked":["Cargo.toml","Cargo.lock","src/main.rs"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["cargo fetch --locked"],"Fix":["cargo fmt"],"Checks":[{"Name":"cargo-format","Run":"cargo fmt --check"},{"Name":"cargo-build","Run":"cargo build --all-targets"},{"Name":"cargo-test","Run":"cargo test"}],"Protect":null,"Runner":""}
      """

  Scenario: Tracked rustfmt.toml and clippy.toml are protected and add clippy last
    When coord-detect-cargo: Detect receives:
      """
      {"Files":{"Cargo.toml":"[package]\nname = \"demo\"\n"},"Tracked":["Cargo.toml","Cargo.lock","rustfmt.toml","clippy.toml"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["cargo fetch --locked"],"Fix":["cargo fmt"],"Checks":[{"Name":"cargo-format","Run":"cargo fmt --check"},{"Name":"cargo-build","Run":"cargo build --all-targets"},{"Name":"cargo-test","Run":"cargo test"},{"Name":"cargo-clippy","Run":"cargo clippy --all-targets -- -D warnings"}],"Protect":["rustfmt.toml","clippy.toml"],"Runner":""}
      """

  Scenario: Hidden .rustfmt.toml is protected and hidden .clippy.toml enables clippy without protection
    When coord-detect-cargo: Detect receives:
      """
      {"Files":{"Cargo.toml":"[package]\n"},"Tracked":["Cargo.toml","Cargo.lock",".rustfmt.toml",".clippy.toml"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["cargo fetch --locked"],"Fix":["cargo fmt"],"Checks":[{"Name":"cargo-format","Run":"cargo fmt --check"},{"Name":"cargo-build","Run":"cargo build --all-targets"},{"Name":"cargo-test","Run":"cargo test"},{"Name":"cargo-clippy","Run":"cargo clippy --all-targets -- -D warnings"}],"Protect":[".rustfmt.toml"],"Runner":""}
      """
    And coord-detect-cargo: the check names are distinct

  Scenario: All Rust config files give one clippy check and three protect entries in order
    When coord-detect-cargo: Detect receives:
      """
      {"Files":{"Cargo.toml":"[package]\n"},"Tracked":[".clippy.toml","clippy.toml",".rustfmt.toml","rustfmt.toml","Cargo.lock","Cargo.toml"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["cargo fetch --locked"],"Fix":["cargo fmt"],"Checks":[{"Name":"cargo-format","Run":"cargo fmt --check"},{"Name":"cargo-build","Run":"cargo build --all-targets"},{"Name":"cargo-test","Run":"cargo test"},{"Name":"cargo-clippy","Run":"cargo clippy --all-targets -- -D warnings"}],"Protect":["rustfmt.toml",".rustfmt.toml","clippy.toml"],"Runner":""}
      """
    And coord-detect-cargo: the check names are distinct

  Scenario: Rust config files that are not tracked are ignored
    When coord-detect-cargo: Detect receives:
      """
      {"Files":{"Cargo.toml":"[package]\n","rustfmt.toml":"edition = \"2021\"\n","clippy.toml":""},"Tracked":["Cargo.toml","Cargo.lock"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["cargo fetch --locked"],"Fix":["cargo fmt"],"Checks":[{"Name":"cargo-format","Run":"cargo fmt --check"},{"Name":"cargo-build","Run":"cargo build --all-targets"},{"Name":"cargo-test","Run":"cargo test"}],"Protect":null,"Runner":""}
      """

  Scenario Outline: Without a tracked Cargo.lock setup is plain cargo fetch
    When coord-detect-cargo: Detect receives:
      """
      {"Files":<files>,"Tracked":["Cargo.toml"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["cargo fetch"],"Fix":["cargo fmt"],"Checks":[{"Name":"cargo-format","Run":"cargo fmt --check"},{"Name":"cargo-build","Run":"cargo build --all-targets"},{"Name":"cargo-test","Run":"cargo test"}],"Protect":null,"Runner":""}
      """
    Examples:
      | files |
      | {"Cargo.toml":"[package]"} |
      | {"Cargo.toml":"[package]","Cargo.lock":"version = 3"} |

  Scenario Outline: A Cargo.toml that is not a tracked root file detects nothing for Rust
    When coord-detect-cargo: Detect receives:
      """
      {"Files":<files>,"Tracked":<tracked>}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":null,"Protect":null,"Runner":""}
      """
    Examples:
      | files | tracked |
      | {"Cargo.toml":"[package]"} | ["Cargo.lock","rustfmt.toml","clippy.toml"] |
      | {"Cargo.toml":"[package]"} | [] |
      | {} | ["Cargo.toml","Cargo.lock"] |
      | {"crates/app/Cargo.toml":"[package]"} | ["crates/app/Cargo.toml","Cargo.lock"] |

  Scenario: A Go module and a Cargo project get both sets of commands with distinct check names
    When coord-detect-cargo: Detect receives:
      """
      {"Files":{"go.mod":"module example\n","Cargo.toml":"[package]\n"},"Tracked":["go.mod","Cargo.toml","Cargo.lock"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["go mod download","cargo fetch --locked"],"Fix":["cargo fmt"],"Checks":[{"Name":"go-format","Run":"test -z \"$(gofmt -l .)\""},{"Name":"go-test","Run":"go test ./..."},{"Name":"go-vet","Run":"go vet ./..."},{"Name":"go-build","Run":"go build -o /dev/null ./..."},{"Name":"cargo-format","Run":"cargo fmt --check"},{"Name":"cargo-build","Run":"cargo build --all-targets"},{"Name":"cargo-test","Run":"cargo test"}],"Protect":null,"Runner":""}
      """
    And coord-detect-cargo: the check names are distinct

  Scenario: A Mix project and a Cargo project append fixers, checks and protect entries in detector order
    When coord-detect-cargo: Detect receives:
      """
      {"Files":{"mix.exs":"","Cargo.toml":"[package]\n"},"Tracked":["mix.exs",".formatter.exs","Cargo.toml","rustfmt.toml"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["mix deps.get","cargo fetch"],"Fix":["mix format","cargo fmt"],"Checks":[{"Name":"format","Run":"mix format --check-formatted"},{"Name":"compile","Run":"mix compile --warnings-as-errors"},{"Name":"test","Run":"mix test"},{"Name":"cargo-format","Run":"cargo fmt --check"},{"Name":"cargo-build","Run":"cargo build --all-targets"},{"Name":"cargo-test","Run":"cargo test"}],"Protect":[".formatter.exs","rustfmt.toml"],"Runner":""}
      """
    And coord-detect-cargo: the check names are distinct

  Scenario: Existing Mix detection output is byte-identical
    When coord-detect-cargo: Detect receives:
      """
      {"Files":{"mix.exs":"deps: [:credo]"},"Tracked":["mix.exs",".formatter.exs",".credo.exs"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["mix deps.get"],"Fix":["mix format"],"Checks":[{"Name":"format","Run":"mix format --check-formatted"},{"Name":"compile","Run":"mix compile --warnings-as-errors"},{"Name":"test","Run":"mix test"},{"Name":"credo","Run":"mix credo --strict"}],"Protect":[".formatter.exs",".credo.exs"],"Runner":""}
      """

  Scenario: Existing npm detection output is byte-identical
    When coord-detect-cargo: Detect receives:
      """
      {"Files":{"package.json":"{\"scripts\":{\"test\":\"jest\",\"lint\":\"eslint .\"},\"devDependencies\":{\"@cucumber/cucumber\":\"1\"}}"},"Tracked":["package.json","package-lock.json","features/steps/a.js"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["npm ci --no-audit --no-fund"],"Fix":null,"Checks":[{"Name":"test","Run":"npm run test"},{"Name":"lint","Run":"npm run lint"}],"Protect":null,"Runner":"features/steps"}
      """

  Scenario: Existing Go detection output is byte-identical
    When coord-detect-cargo: Detect receives:
      """
      {"Files":{"go.mod":"module example\n","cli/go.mod":"module cli\n"},"Tracked":["go.mod","cli/go.mod"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["go mod download","(cd cli && go mod download)"],"Fix":null,"Checks":[{"Name":"go-root-format","Run":"test -z \"$(gofmt -l .)\""},{"Name":"go-root-test","Run":"go test ./..."},{"Name":"go-root-vet","Run":"go vet ./..."},{"Name":"go-root-build","Run":"go build -o /dev/null ./..."},{"Name":"go-cli-format","Run":"(cd cli && test -z \"$(gofmt -l .)\")"},{"Name":"go-cli-test","Run":"(cd cli && go test ./...)"},{"Name":"go-cli-vet","Run":"(cd cli && go vet ./...)"},{"Name":"go-cli-build","Run":"(cd cli && go build -o /dev/null ./...)"}],"Protect":null,"Runner":""}
      """

  Scenario: Existing Bundler detection output is byte-identical
    When coord-detect-cargo: Detect receives:
      """
      {"Files":{"Gemfile":"source \"https://rubygems.org\"\n"},"Tracked":["Gemfile","Gemfile.lock","bin/rails"]}
      """
    Then coord-detect-cargo: Detect writes exactly:
      """
      {"Setup":["bundle install"],"Fix":null,"Checks":[{"Name":"test","Run":"bin/rails test"}],"Protect":null,"Runner":""}
      """
