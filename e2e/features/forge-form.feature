Feature: Forge Token Form

  Scenario: Forge overlay opens when "Forge Token" button is clicked
    Given the wallet is connected
    When the user clicks the "Forge Token" button
    Then the Forge overlay modal is visible

  Scenario: Creation fee is displayed on overlay open
    Given the Forge overlay is open
    Then the GAS creation fee is displayed

  Scenario: Symbol is auto-uppercased as the user types
    Given the Forge overlay is open
    When the user types "hush" into the symbol field
    Then the symbol field shows "HUSH"

  Scenario: Symbol with numbers fails validation
    Given the Forge overlay is open
    When the user enters "HU5H" as the symbol
    Then a validation error appears on the symbol field
    And the FORGE button is disabled

  Scenario: Symbol shorter than 2 chars fails validation
    Given the Forge overlay is open
    When the user enters "H" as the symbol
    Then a validation error appears on the symbol field

  Scenario: Empty token name fails validation
    Given the Forge overlay is open
    When the user clears the token name field
    Then a validation error appears on the name field

  Scenario: Zero total supply fails validation
    Given the Forge overlay is open
    When the user enters 0 as the total supply
    Then a validation error appears on the supply field

  Scenario: Sufficient GAS balance shows green check
    Given the wallet has enough GAS to pay the creation fee
    When the Forge overlay is open
    Then the GAS balance indicator shows green

  Scenario: Insufficient GAS balance shows red error and disables FORGE button
    Given the wallet has less GAS than the creation fee
    When the Forge overlay is open
    Then the GAS balance indicator shows red
    And the FORGE button is disabled

  Scenario: Overlay closes when Cancel is clicked
    Given the Forge overlay is open
    When the user clicks Cancel
    Then the Forge overlay is no longer visible
    And the user is back on the /tokens dashboard
