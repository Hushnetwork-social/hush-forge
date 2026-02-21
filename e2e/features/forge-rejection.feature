Feature: Forge Error Handling

  Scenario: Wallet rejection shows inline error and keeps form values
    Given the Forge overlay is open with valid token details
    And the mock wallet is set to reject mode
    When the user clicks FORGE
    Then an inline error message appears: "Transaction cancelled. Please try again."
    And the form values are preserved
    And the user remains on the Forge overlay

  Scenario: Banner warns when factory is deployed but not initialized
    Given the factory is deployed but its initialization is incomplete
    And the wallet is connected
    Then a warning banner explains the factory needs initialization
    And an "Initialize Factory" action button is shown
    And the Forge Token button is disabled
