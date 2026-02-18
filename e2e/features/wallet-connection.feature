Feature: Wallet Connection

  Scenario: Connect NeoLine wallet for the first time
    Given the user navigates to /tokens
    When the user clicks "Connect Wallet"
    Then the wallet connection modal appears
    And after connecting the wallet address is shown in the header

  Scenario: Wallet address is persisted after page refresh
    Given the user has connected their wallet
    When the page is refreshed
    Then the wallet remains connected without prompting again

  Scenario: Disconnect wallet clears session
    Given the user has connected their wallet
    When the user disconnects the wallet
    Then the header shows "Connect Wallet" again
    And the token list is cleared
