@issue:85
Feature: Retry only idempotent requests
  As a person calling a tool with side effects,
  I want a timed-out call never to be sent again,
  so that retries cannot repeat a side effect on my server.

  @AC-PROXY-RETRY-01 @suite:proxy
  Scenario: No retry of tools/call
    Given retries set to 3 and scenario /hang
    When a tools/call times out
    Then the origin received exactly one request

  @AC-PROXY-RETRY-02 @suite:proxy
  Scenario: Lists still retry
    Given retries set to 2 and a failing tools/list
    When it runs
    Then the origin received three requests
