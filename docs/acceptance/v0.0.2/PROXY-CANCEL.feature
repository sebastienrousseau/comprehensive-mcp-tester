@issue:86
Feature: Cancel a request from the UI and stop the upstream fetch
  As a person waiting on a slow call,
  I want a Cancel button that stops the request everywhere,
  so that a hung call does not lock the UI for two minutes or keep running on the server side.

  @AC-PROXY-CANCEL-01 @suite:hosts
  Scenario: Hosts stop the upstream fetch
    Given a hanging origin
    When the client aborts after 100 ms
    Then the origin socket closes within 500 ms

  @AC-PROXY-CANCEL-02 @suite:e2e
  Scenario: Cancel frees the UI
    Given a call to a tool that never answers (scenario hang-call)
    When the user presses Cancel
    Then the call button is enabled again at once and the Log shows the cancellation

  @AC-PROXY-CANCEL-03 @suite:e2e
  Scenario: Server told about the cancel
    Given an in-flight tools/call
    When the user cancels it
    Then a notifications/cancelled with its request id is sent
