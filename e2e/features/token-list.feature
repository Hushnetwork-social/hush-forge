Feature: Market And Token Lists

  Scenario: Public markets landing shows the route split entrypoint
    When the user navigates to /markets
    Then the public market shell is visible
    And the Pairs tab is active

  Scenario: Own tokens show a Yours badge
    Given the test account has created at least one token
    When the user views the /tokens dashboard
    Then each own token shows a Yours badge

  Scenario: "My Tokens" tab shows only own tokens
    Given the test account holds tokens it does not own
    When the user clicks the "My Tokens" tab
    Then only tokens created by the test account are shown

  Scenario: Token list is empty when wallet has no tokens
    Given a fresh wallet with no token holdings
    When the user navigates to /tokens
    Then the token grid shows an empty state message
