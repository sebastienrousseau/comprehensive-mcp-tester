@issue:83
Feature: Stream the origin response with a size cap
  As an operator of the public Worker,
  I want the proxy to stop reading a response past a size cap,
  so that one large or runaway response cannot exhaust the isolate or the browser.

  @AC-PROXY-BOUND-01 @suite:proxy
  Scenario: A large response is truncated
    Given a fake origin streaming 20 MB
    When the proxy handles it with an 8 MB cap
    Then it returns with diag.truncated true and at most 8 MB of body

  @AC-PROXY-BOUND-02 @suite:proxy
  Scenario: Memory stays bounded
    Given the same 20 MB stream
    When the proxy handles it
    Then RSS grows by less than three times the cap

  @AC-PROXY-BOUND-03 @suite:ui-logic
  Scenario: The UI says the body was cut
    Given a truncated envelope
    When the Log shows the entry
    Then it states the byte count and that the body was truncated
