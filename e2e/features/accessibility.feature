Feature: Accessibility

  Scenario: Forge overlay traps keyboard focus
    Given the wallet is connected
    When the user clicks the "Forge Token" button
    Then keyboard focus is trapped inside the Forge overlay
    And pressing Escape closes the overlay

  Scenario: Pending transaction toast announces status to screen readers
    Given a pending transaction toast is visible
    Then the pending toast has role status and is polite
    And the pending toast has an accessible label

  Scenario: All icon-only buttons on the market shell have accessible labels
    Given the user navigates to /markets
    Then every icon-only button has an aria-label attribute
