@issue:84
Feature: Return an SSE response as soon as its id arrives
  As a person testing a server that keeps its SSE stream open,
  I want the proxy to return the response as soon as it arrives,
  so that a working server is not reported as a timeout.

  @AC-PROXY-SSE-01 @suite:proxy
  Scenario: Early return
    Given scenario sse-keepalive with timeoutMs 2000
    When a tools/list goes through the proxy
    Then it returns in under 200 ms with diag.ok true and the response in the body

  @AC-PROXY-SSE-02 @suite:proxy
  Scenario: Notifications still read to the end
    Given an SSE answer to a notification with no id
    When the proxy handles it
    Then it reads until the stream ends or the cap
