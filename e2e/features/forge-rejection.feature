Feature: Forge Error Handling

  Scenario: Wallet rejection shows inline error and keeps form values
    Given the Forge overlay is open with valid token details
    And the mock wallet is set to reject mode
    When the user clicks FORGE
    Then an inline error message appears: "Wallet rejected the transaction"
    And the form values are preserved
    And the user remains on the Forge overlay

  Scenario: On-chain TX fault shows error toaster with NeoTube link
    Given the WaitingOverlay is active
    When the transaction fails with a FAULT state on-chain
    Then the WaitingOverlay closes
    And an error toaster appears at bottom-right
    And the toaster shows a NeoTube link to the failed transaction
    And the user remains on the /tokens dashboard

  Scenario: Polling timeout shows error toaster
    Given the WaitingOverlay is active
    When the transaction polling times out after the configured interval
    Then the WaitingOverlay closes
    And an error toaster appears: "Transaction confirmation timed out"
    And the user remains on the /tokens dashboard
