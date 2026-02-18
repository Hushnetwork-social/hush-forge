Feature: Token List Dashboard

  Scenario: Token dashboard shows wallet balances when connected
    Given the wallet is connected with the test account
    When the user navigates to /tokens
    Then the token grid shows tokens held by the test account

  Scenario: Own tokens appear first in the list with a star marker
    Given the test account has created at least one token
    When the user views the /tokens dashboard
    Then own tokens appear at the top of the list
    And each own token shows a star marker

  Scenario: Upgradeable own tokens show an open lock icon
    Given the test account owns an upgradeable token
    When the user views the token list
    Then that token shows an open lock icon

  Scenario: Non-upgradeable own tokens show a closed lock icon
    Given the test account owns a non-upgradeable token
    When the user views the token list
    Then that token shows a closed lock icon

  Scenario: "My tokens only" filter hides all non-own tokens
    Given the test account holds tokens it does not own
    When the user enables the "My tokens only" filter
    Then only tokens created by the test account are shown

  Scenario: Token list is empty when wallet has no tokens
    Given a fresh wallet with no token holdings
    When the user navigates to /tokens
    Then the token grid shows an empty state message
