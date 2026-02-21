Feature: Forge Transaction Flow

  Scenario: Full happy path — create token and see it in the list
    Given the wallet is connected with sufficient GAS
    And the Forge overlay is open with valid token details
    When the user clicks the FORGE button
    And the mock wallet signs the transaction
    And the transaction is confirmed on the private devnet
    Then the user is redirected to the token detail page
    And the new token appears in the own tokens list

  Scenario: Waiting overlay appears after wallet signing
    Given the Forge overlay is open with a valid form
    When the user clicks FORGE and the wallet signs
    Then the Forge overlay is replaced by the WaitingOverlay
    And the WaitingOverlay shows a spinner and "Forging your token…"

  Scenario: Waiting overlay shows txHash with NeoTube link
    Given the WaitingOverlay is active
    Then the transaction hash is displayed
    And a link to NeoTube explorer is shown for the transaction

  Scenario: Successful creation redirects to token detail page
    Given the WaitingOverlay is waiting for txHash "0xtestTx"
    When the transaction is confirmed with contract hash "0xtestContract"
    Then the user is redirected to /tokens/0xtestContract

  Scenario: New token appears in own tokens list after creation
    Given a token was successfully created
    When the user navigates back to /tokens
    Then the newly created token appears with a Yours badge
