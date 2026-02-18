Feature: Update Token

  Scenario: Update overlay opens from token detail page
    Given the user is on the detail page of their own upgradeable token
    When the user clicks "Update Token"
    Then the UpdateOverlay modal is visible

  Scenario: Update form is pre-filled with current token values
    Given the UpdateOverlay is open for a token named "HushToken"
    Then the name field shows "HushToken"
    And the other fields show the current on-chain values

  Scenario: Successful update shows confirmation toaster
    Given the UpdateOverlay is open with modified values
    When the user clicks FORGE and the wallet signs
    And the update transaction is confirmed on-chain
    Then a success toaster appears: "Token updated successfully"
    And the token detail page refreshes with the new values

  Scenario: On-chain rejection shows error toaster
    Given the UpdateOverlay submitted a transaction
    When the transaction fails on-chain
    Then an error toaster appears with a NeoTube link to the failed TX
    And the token detail page remains showing the old values
