Feature: Detect Gradle and Maven checks
  Scenario: A tracked build.gradle with a tracked gradlew uses the wrapper and protects it
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":{"build.gradle":"plugins { id 'java' }\n"},"Tracked":["build.gradle","gradlew","src/main/java/App.java"]}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":[{"Name":"gradle-check","Run":"./gradlew check --console=plain"}],"Protect":["gradlew"],"Runner":""}
      """

  Scenario Outline: Any tracked root Gradle manifest without a wrapper uses plain gradle
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":{"<manifest>":""},"Tracked":["<manifest>"]}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":[{"Name":"gradle-check","Run":"gradle check --console=plain"}],"Protect":null,"Runner":""}
      """
    Examples:
      | manifest            |
      | settings.gradle.kts |
      | settings.gradle     |
      | build.gradle        |
      | build.gradle.kts    |

  Scenario: A tracked pom.xml with the Maven wrapper uses mvnw and protects both wrapper files
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":{"pom.xml":"<project/>\n"},"Tracked":[".mvn/wrapper/maven-wrapper.properties","mvnw","pom.xml"]}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":[{"Name":"maven-verify","Run":"./mvnw -B -ntp verify"}],"Protect":["mvnw",".mvn/wrapper/maven-wrapper.properties"],"Runner":""}
      """

  Scenario Outline: A tracked pom.xml without a tracked wrapper uses plain mvn
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":<files>,"Tracked":<tracked>}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":[{"Name":"maven-verify","Run":"mvn -B -ntp verify"}],"Protect":null,"Runner":""}
      """
    Examples:
      | files                                   | tracked                    |
      | {"pom.xml":"<project/>"}                | ["pom.xml"]                |
      | {}                                      | ["pom.xml"]                |
      | {"pom.xml":"<project/>","mvnw":"#!/bin/sh"} | ["pom.xml"]           |
      | {"pom.xml":"<project/>"}                | ["pom.xml","sub/mvnw"]     |

  Scenario Outline: An untracked or nested Gradle wrapper is not used
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":<files>,"Tracked":<tracked>}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":[{"Name":"gradle-check","Run":"gradle check --console=plain"}],"Protect":null,"Runner":""}
      """
    Examples:
      | files                                        | tracked                          |
      | {"build.gradle":"","gradlew":"#!/bin/sh"}    | ["build.gradle"]                 |
      | {"build.gradle":""}                          | ["build.gradle","sub/gradlew"]   |

  Scenario: Both build systems with every protected file give both checks and protect in order
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":{"build.gradle.kts":"","pom.xml":"<project/>\n"},"Tracked":[".mvn/wrapper/maven-wrapper.properties","mvnw","gradle.properties","gradle/wrapper/gradle-wrapper.properties","gradlew","pom.xml","build.gradle.kts"]}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":[{"Name":"gradle-check","Run":"./gradlew check --console=plain"},{"Name":"maven-verify","Run":"./mvnw -B -ntp verify"}],"Protect":["gradlew","gradle/wrapper/gradle-wrapper.properties","gradle.properties","mvnw",".mvn/wrapper/maven-wrapper.properties"],"Runner":""}
      """
    And coord-detect-gradle-maven: the check names are distinct

  Scenario: Tracked Gradle wrapper properties and gradle.properties are protected without a wrapper script
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":{},"Tracked":["settings.gradle","gradle.properties","gradle/wrapper/gradle-wrapper.properties"]}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":[{"Name":"gradle-check","Run":"gradle check --console=plain"}],"Protect":["gradle/wrapper/gradle-wrapper.properties","gradle.properties"],"Runner":""}
      """

  Scenario Outline: Untracked, nested or manifest-less build files detect nothing
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":<files>,"Tracked":<tracked>}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":null,"Protect":null,"Runner":""}
      """
    Examples:
      | files                                      | tracked                                                   |
      | {"pom.xml":"<project/>"}                   | []                                                        |
      | {"pom.xml":"<project/>"}                   | ["mvnw",".mvn/wrapper/maven-wrapper.properties"]          |
      | {"sub/pom.xml":"<project/>"}               | ["sub/pom.xml"]                                           |
      | {"build.gradle":""}                        | ["gradlew","gradle.properties"]                           |
      | {"sub/build.gradle":""}                    | ["sub/build.gradle","sub/settings.gradle.kts"]            |
      | {}                                         | ["gradlew","gradle/wrapper/gradle-wrapper.properties","gradle.properties","mvnw"] |

  Scenario: A Go module and a Maven project get both sets of checks with distinct names
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":{"go.mod":"module example\n","pom.xml":"<project/>\n"},"Tracked":["go.mod","pom.xml"]}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":["go mod download"],"Fix":null,"Checks":[{"Name":"go-format","Run":"test -z \"$(gofmt -l .)\""},{"Name":"go-test","Run":"go test ./..."},{"Name":"go-vet","Run":"go vet ./..."},{"Name":"go-build","Run":"go build -o /dev/null ./..."},{"Name":"maven-verify","Run":"mvn -B -ntp verify"}],"Protect":null,"Runner":""}
      """
    And coord-detect-gradle-maven: the check names are distinct

  Scenario: Existing Mix detection output is byte-identical
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":{"mix.exs":"deps: [:credo]"},"Tracked":["mix.exs",".formatter.exs",".credo.exs"]}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":["mix deps.get"],"Fix":["mix format"],"Checks":[{"Name":"format","Run":"mix format --check-formatted"},{"Name":"compile","Run":"mix compile --warnings-as-errors"},{"Name":"test","Run":"mix test"},{"Name":"credo","Run":"mix credo --strict"}],"Protect":[".formatter.exs",".credo.exs"],"Runner":""}
      """

  Scenario: Existing npm detection output is byte-identical
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":{"package.json":"{\"scripts\":{\"test\":\"jest\",\"lint\":\"eslint .\"},\"devDependencies\":{\"@cucumber/cucumber\":\"1\"}}"},"Tracked":["package.json","package-lock.json","features/steps/a.js"]}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":["npm ci --no-audit --no-fund"],"Fix":null,"Checks":[{"Name":"test","Run":"npm run test"},{"Name":"lint","Run":"npm run lint"}],"Protect":null,"Runner":"features/steps"}
      """

  Scenario: Existing Go detection output is byte-identical
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":{"go.mod":"module example\n","cli/go.mod":"module cli\n"},"Tracked":["go.mod","cli/go.mod"]}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":["go mod download","(cd cli && go mod download)"],"Fix":null,"Checks":[{"Name":"go-root-format","Run":"test -z \"$(gofmt -l .)\""},{"Name":"go-root-test","Run":"go test ./..."},{"Name":"go-root-vet","Run":"go vet ./..."},{"Name":"go-root-build","Run":"go build -o /dev/null ./..."},{"Name":"go-cli-format","Run":"(cd cli && test -z \"$(gofmt -l .)\")"},{"Name":"go-cli-test","Run":"(cd cli && go test ./...)"},{"Name":"go-cli-vet","Run":"(cd cli && go vet ./...)"},{"Name":"go-cli-build","Run":"(cd cli && go build -o /dev/null ./...)"}],"Protect":null,"Runner":""}
      """

  Scenario: Existing Bundler detection output is byte-identical
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":{"Gemfile":"source \"https://rubygems.org\"\n"},"Tracked":["Gemfile","Gemfile.lock","bin/rails"]}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":["bundle install"],"Fix":null,"Checks":[{"Name":"test","Run":"bin/rails test"}],"Protect":null,"Runner":""}
      """

  Scenario: Existing Cargo detection output is byte-identical
    When coord-detect-gradle-maven: Detect receives:
      """
      {"Files":{"Cargo.toml":"[package]\n"},"Tracked":["Cargo.toml","Cargo.lock","rustfmt.toml"]}
      """
    Then coord-detect-gradle-maven: Detect writes exactly:
      """
      {"Setup":["cargo fetch --locked"],"Fix":["cargo fmt"],"Checks":[{"Name":"cargo-format","Run":"cargo fmt --check"},{"Name":"cargo-build","Run":"cargo build --all-targets"},{"Name":"cargo-test","Run":"cargo test"}],"Protect":["rustfmt.toml"],"Runner":""}
      """
