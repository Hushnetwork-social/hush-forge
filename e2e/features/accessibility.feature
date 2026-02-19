Feature: Accessibility

  Scenario: Forge overlay traps keyboard focus
    Given the wallet is connected
    When the user clicks the "Forge Token" button
    Then keyboard focus is trapped inside the Forge overlay
    And pressing Escape closes the overlay

  Scenario: WaitingOverlay announces status to screen readers
    Given the WaitingOverlay is active
    Then the overlay has role status and is polite
    And the overlay has an accessible label

  Scenario: All icon-only buttons have accessible labels
    Given the user navigates to /tokens
    Then every icon-only button has an aria-label attribute
