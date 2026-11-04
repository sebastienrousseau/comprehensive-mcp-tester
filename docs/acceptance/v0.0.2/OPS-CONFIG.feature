@issue:88
Feature: Validated operator settings and MCP_TESTER_ALLOWED_TARGETS
  As an operator deploying the Worker or the local server,
  I want every setting validated at startup and the effective policy printed,
  so that I know exactly what the proxy may reach.

  @AC-OPS-CONFIG-01 @suite:hosts
  Scenario: Invalid settings fail fast
    Given MCP_TESTER_ALLOWED_TARGETS=not a url
    When the local server starts
    Then it exits non-zero naming the variable

  @AC-OPS-CONFIG-02 @suite:hosts
  Scenario: The old name still works, with a warning
    Given ALLOWED_ORIGINS=example.com
    When the server starts
    Then the policy allows https://example.com and a deprecation warning is printed

  @AC-OPS-CONFIG-03 @suite:hosts
  Scenario: Effective policy printed
    Given any configuration
    When the server starts
    Then the summary lists the allowed targets, limits and bind mode
