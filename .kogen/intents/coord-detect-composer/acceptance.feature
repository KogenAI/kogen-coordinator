Feature: Detect PHP Composer projects from committed root files
  Scenario: phpunit with a tracked lock gives install setup and composer-test
    When coord-detect-composer: Detect receives:
      """
      {"Files":{"composer.json":"{\"require-dev\":{\"phpunit/phpunit\":\"^11\"}}"},"Tracked":["composer.json","composer.lock"]}
      """
    Then coord-detect-composer: Detect writes exactly:
      """
      {"Setup":["composer install --no-interaction --prefer-dist"],"Fix":null,"Checks":[{"Name":"composer-test","Run":"vendor/bin/phpunit"}],"Protect":null,"Runner":""}
      """

  Scenario: Without a tracked lock the setup is the update form
    When coord-detect-composer: Detect receives:
      """
      {"Files":{"composer.json":"{\"require-dev\":{\"phpunit/phpunit\":\"^11\"}}"},"Tracked":["composer.json"]}
      """
    Then coord-detect-composer: Detect writes exactly:
      """
      {"Setup":["composer update --no-interaction --prefer-dist"],"Fix":null,"Checks":[{"Name":"composer-test","Run":"vendor/bin/phpunit"}],"Protect":null,"Runner":""}
      """

  Scenario: Untracked composer.lock gives update setup
    When coord-detect-composer: Detect receives:
      """
      {"Files":{"composer.json":"{}","composer.lock":"{}"},"Tracked":["composer.json"]}
      """
    Then coord-detect-composer: Detect writes exactly:
      """
      {"Setup":["composer update --no-interaction --prefer-dist"],"Fix":null,"Checks":null,"Protect":null,"Runner":""}
      """

  Scenario: Composer json naming neither tool gives setup only
    When coord-detect-composer: Detect receives:
      """
      {"Files":{"composer.json":"{\"require\":{\"monolog/monolog\":\"^3\"}}"},"Tracked":["composer.json","composer.lock"]}
      """
    Then coord-detect-composer: Detect writes exactly:
      """
      {"Setup":["composer install --no-interaction --prefer-dist"],"Fix":null,"Checks":null,"Protect":null,"Runner":""}
      """

  Scenario: phpstan adds composer-stan and a tracked phpstan.neon is protected
    When coord-detect-composer: Detect receives:
      """
      {"Files":{"composer.json":"{\"require-dev\":{\"phpunit/phpunit\":\"^11\",\"phpstan/phpstan\":\"^2\"}}","phpstan.neon":"parameters:\n","phpunit.xml.dist":"<phpunit/>"},"Tracked":["composer.json","composer.lock","phpstan.neon","phpunit.xml.dist"]}
      """
    Then coord-detect-composer: Detect writes exactly:
      """
      {"Setup":["composer install --no-interaction --prefer-dist"],"Fix":null,"Checks":[{"Name":"composer-test","Run":"vendor/bin/phpunit"},{"Name":"composer-stan","Run":"vendor/bin/phpstan analyse"}],"Protect":["phpunit.xml.dist","phpstan.neon"],"Runner":""}
      """

  Scenario: Untracked phpstan.neon is not protected
    When coord-detect-composer: Detect receives:
      """
      {"Files":{"composer.json":"{\"require-dev\":{\"phpstan/phpstan\":\"^2\"}}","phpstan.neon":"parameters:\n"},"Tracked":["composer.json","composer.lock"]}
      """
    Then coord-detect-composer: Detect writes exactly:
      """
      {"Setup":["composer install --no-interaction --prefer-dist"],"Fix":null,"Checks":[{"Name":"composer-stan","Run":"vendor/bin/phpstan analyse"}],"Protect":null,"Runner":""}
      """

  Scenario: Untracked composer.json is not a Composer project
    When coord-detect-composer: Detect receives:
      """
      {"Files":{"composer.json":"{\"require-dev\":{\"phpunit/phpunit\":\"^11\"}}"},"Tracked":["README.md"]}
      """
    Then coord-detect-composer: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":null,"Protect":null,"Runner":""}
      """

  Scenario: A combined Go and Composer root keeps the Go checks unchanged
    When coord-detect-composer: Detect receives:
      """
      {"Files":{"go.mod":"module x","composer.json":"{\"require-dev\":{\"phpunit/phpunit\":\"^11\"}}"},"Tracked":["go.mod","composer.json","composer.lock"]}
      """
    Then coord-detect-composer: Detect writes exactly:
      """
      {"Setup":["go mod download","composer install --no-interaction --prefer-dist"],"Fix":null,"Checks":[{"Name":"go-format","Run":"test -z \"$(gofmt -l .)\""},{"Name":"go-test","Run":"go test ./..."},{"Name":"go-vet","Run":"go vet ./..."},{"Name":"go-build","Run":"go build -o /dev/null ./..."},{"Name":"composer-test","Run":"vendor/bin/phpunit"}],"Protect":null,"Runner":""}
      """
