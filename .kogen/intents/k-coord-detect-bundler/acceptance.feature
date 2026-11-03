Feature: Detect Bundler from committed files
  Scenario Outline: Determine only evidenced Bundler commands
    When Bundler detection receives files <files> and tracked <tracked>
    Then Bundler detection returns <result>

    Examples:
      | files | tracked | result |
      | {"Gemfile":"source 'https://rubygems.org'","Gemfile.lock":"GEM","bin/rails":"#!/usr/bin/env ruby"} | ["Gemfile","Gemfile.lock","bin/rails"] | {"Setup":["bundle install"],"Checks":[{"Name":"test","Run":"bin/rails test"}],"Fix":[],"Protect":[],"Runner":""} |
      | {"Gemfile":"","Gemfile.lock":""} | ["Gemfile","Gemfile.lock"] | {"Setup":["bundle install"],"Checks":[],"Fix":[],"Protect":[],"Runner":""} |
      | {"Gemfile":"","Gemfile.lock":"","bin/rails":""} | ["Gemfile","Gemfile.lock"] | {"Setup":["bundle install"],"Checks":[],"Fix":[],"Protect":[],"Runner":""} |
      | {"Gemfile":"","bin/rails":""} | ["Gemfile","bin/rails"] | {"Setup":[],"Checks":[],"Fix":[],"Protect":[],"Runner":""} |
      | {"Gemfile":"","Gemfile.lock":"","bin/rails":""} | ["Gemfile","bin/rails"] | {"Setup":[],"Checks":[],"Fix":[],"Protect":[],"Runner":""} |
      | {"Gemfile":"","Gemfile.lock":"","bin/rails":""} | ["Gemfile.lock","bin/rails"] | {"Setup":[],"Checks":[],"Fix":[],"Protect":[],"Runner":""} |
      | {} | ["Gemfile","Gemfile.lock","bin/rails"] | {"Setup":[],"Checks":[],"Fix":[],"Protect":[],"Runner":""} |
      | {"mix.exs":""} | ["mix.exs"] | {"Setup":["mix deps.get"],"Checks":[{"Name":"compile","Run":"mix compile --warnings-as-errors"},{"Name":"test","Run":"mix test"}],"Fix":[],"Protect":[],"Runner":""} |
      | {"go.mod":"module example.invalid/app"} | ["go.mod"] | {"Setup":["go mod download"],"Checks":[{"Name":"go-format","Run":"test -z \"$(gofmt -l .)\""},{"Name":"go-test","Run":"go test ./..."},{"Name":"go-vet","Run":"go vet ./..."},{"Name":"go-build","Run":"go build -o /dev/null ./..."}],"Fix":[],"Protect":[],"Runner":""} |
      | {"mix.exs":"","Gemfile":"","Gemfile.lock":""} | ["mix.exs","Gemfile","Gemfile.lock","bin/rails"] | {"Setup":["mix deps.get","bundle install"],"Checks":[{"Name":"compile","Run":"mix compile --warnings-as-errors"},{"Name":"test","Run":"mix test"},{"Name":"bundler-test","Run":"bin/rails test"}],"Fix":[],"Protect":[],"Runner":""} |
      | {"package.json":"{\"scripts\":{\"test\":\"jest\"}}","Gemfile":""} | ["package.json","package-lock.json","Gemfile","Gemfile.lock","bin/rails"] | {"Setup":["npm ci --no-audit --no-fund","bundle install"],"Checks":[{"Name":"test","Run":"npm run test"},{"Name":"bundler-test","Run":"bin/rails test"}],"Fix":[],"Protect":[],"Runner":""} |
