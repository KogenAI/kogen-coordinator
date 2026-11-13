Feature: Detect Python projects from committed root files
  Scenario: pyproject.toml mentioning pytest gives editable setup and python-test
    When coord-detect-python: Detect receives:
      """
      {"Files":{"pyproject.toml":"[project]\nname = \"demo\"\n[tool.pytest.ini_options]\n"},"Tracked":["pyproject.toml","demo/__init__.py"]}
      """
    Then coord-detect-python: Detect writes exactly:
      """
      {"Setup":["python -m pip install -e ."],"Fix":null,"Checks":[{"Name":"python-test","Run":"pytest"}],"Protect":null,"Runner":""}
      """

  Scenario: requirements.txt gives -r setup and python-test
    When coord-detect-python: Detect receives:
      """
      {"Files":{"pyproject.toml":"[project]\nname = \"demo\"\n","requirements.txt":"pytest>=8\n"},"Tracked":["pyproject.toml","requirements.txt"]}
      """
    Then coord-detect-python: Detect writes exactly:
      """
      {"Setup":["python -m pip install -r requirements.txt"],"Fix":null,"Checks":[{"Name":"python-test","Run":"pytest"}],"Protect":null,"Runner":""}
      """

  Scenario: requirements.txt alone without pytest gives setup and no checks
    When coord-detect-python: Detect receives:
      """
      {"Files":{"requirements.txt":"requests\n"},"Tracked":["requirements.txt"]}
      """
    Then coord-detect-python: Detect writes exactly:
      """
      {"Setup":["python -m pip install -r requirements.txt"],"Fix":null,"Checks":null,"Protect":null,"Runner":""}
      """

  Scenario: A tool.ruff table adds python-lint after python-test
    When coord-detect-python: Detect receives:
      """
      {"Files":{"pyproject.toml":"[tool.pytest]\n[tool.ruff]\nline-length = 100\n"},"Tracked":["pyproject.toml"]}
      """
    Then coord-detect-python: Detect writes exactly:
      """
      {"Setup":["python -m pip install -e ."],"Fix":null,"Checks":[{"Name":"python-test","Run":"pytest"},{"Name":"python-lint","Run":"python -m ruff check ."}],"Protect":null,"Runner":""}
      """

  Scenario: Without a ruff table there is no lint check
    When coord-detect-python: Detect receives:
      """
      {"Files":{"pyproject.toml":"[tool.pytest]\n"},"Tracked":["pyproject.toml"]}
      """
    Then coord-detect-python: Detect writes exactly:
      """
      {"Setup":["python -m pip install -e ."],"Fix":null,"Checks":[{"Name":"python-test","Run":"pytest"}],"Protect":null,"Runner":""}
      """

  Scenario: Tracked ruff.toml adds lint and is protected, with pytest.ini in order
    When coord-detect-python: Detect receives:
      """
      {"Files":{"pyproject.toml":"[project]\n"},"Tracked":["pytest.ini",".ruff.toml","ruff.toml","pyproject.toml"]}
      """
    Then coord-detect-python: Detect writes exactly:
      """
      {"Setup":["python -m pip install -e ."],"Fix":null,"Checks":[{"Name":"python-lint","Run":"python -m ruff check ."}],"Protect":["ruff.toml",".ruff.toml","pytest.ini"],"Runner":""}
      """

  Scenario: Untracked ruff.toml is not protected
    When coord-detect-python: Detect receives:
      """
      {"Files":{"pyproject.toml":"[tool.pytest]\n","ruff.toml":"line-length = 88\n"},"Tracked":["pyproject.toml"]}
      """
    Then coord-detect-python: Detect writes exactly:
      """
      {"Setup":["python -m pip install -e ."],"Fix":null,"Checks":[{"Name":"python-test","Run":"pytest"}],"Protect":null,"Runner":""}
      """

  Scenario: An untracked pyproject.toml is absent
    When coord-detect-python: Detect receives:
      """
      {"Files":{"pyproject.toml":"[tool.pytest]\n[tool.ruff]\n"},"Tracked":["README.md","ruff.toml"]}
      """
    Then coord-detect-python: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":null,"Protect":null,"Runner":""}
      """

  Scenario: A root with only README.md yields nothing
    When coord-detect-python: Detect receives:
      """
      {"Files":{"README.md":"# demo\n"},"Tracked":["README.md"]}
      """
    Then coord-detect-python: Detect writes exactly:
      """
      {"Setup":null,"Fix":null,"Checks":null,"Protect":null,"Runner":""}
      """

  Scenario: A combined Go and Python root keeps the Go checks unchanged
    When coord-detect-python: Detect receives:
      """
      {"Files":{"go.mod":"module x","pyproject.toml":"[tool.pytest]\n"},"Tracked":["go.mod","pyproject.toml"]}
      """
    Then coord-detect-python: Detect writes exactly:
      """
      {"Setup":["go mod download","python -m pip install -e ."],"Fix":null,"Checks":[{"Name":"go-format","Run":"test -z \"$(gofmt -l .)\""},{"Name":"go-test","Run":"go test ./..."},{"Name":"go-vet","Run":"go vet ./..."},{"Name":"go-build","Run":"go build -o /dev/null ./..."},{"Name":"python-test","Run":"pytest"}],"Protect":null,"Runner":""}
      """
