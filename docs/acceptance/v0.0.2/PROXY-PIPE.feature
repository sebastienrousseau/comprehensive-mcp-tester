@issue:82
Feature: Split proxyMcp into small tested steps
  As a contributor changing the proxy,
  I want proxyMcp split into small functions with their own tests,
  so that each fix in this release lands in one place and the complexity gate passes.

  @AC-PROXY-PIPE-01 @suite:proxy
  Scenario: Behaviour unchanged
    Given the existing proxy and hosts suites
    When they run against the refactored core
    Then every test passes unchanged

  @AC-PROXY-PIPE-02 @suite:tooling
  Scenario: Complexity within the ceilings
    Given the refactored src/core/proxy.js
    When npm run lint runs
    Then no function in it is over a ceiling and its baseline entries are gone
