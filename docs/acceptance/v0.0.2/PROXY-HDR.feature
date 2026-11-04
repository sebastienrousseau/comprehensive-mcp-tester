@issue:87
Feature: Reject invalid headers with 400 and never crash the Worker
  As a person typing a custom header,
  I want a clear 400 when a header name or value is invalid,
  so that a typo does not crash the proxy.

  @AC-PROXY-HDR-01 @suite:hosts
  Scenario: Bad name gives 400
    Given a payload with header "bad name"
    When it reaches either host
    Then the answer is 400 and names the header

  @AC-PROXY-HDR-02 @suite:hosts
  Scenario: Worker never throws
    Given an internal error in the Worker handler
    When a request arrives
    Then the answer is a JSON 500, not an exception
