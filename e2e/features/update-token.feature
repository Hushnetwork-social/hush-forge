Feature: Update Token

  Scenario: Update overlay opens from token detail page
    Given the user is on the detail page of their own upgradeable token
    When the user clicks "Update Token"
    Then the UpdateOverlay modal is visible

  Scenario: Update form is pre-filled with current token values
    Given the UpdateOverlay is open for an own upgradeable token
    Then the name field is pre-filled
    And the other fields show the current on-chain values

