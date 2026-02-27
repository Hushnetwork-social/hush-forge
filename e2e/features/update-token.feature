Feature: Update Token

  Scenario: Token administration panel is available for creator tokens
    Given the user is on the detail page of their own upgradeable token
    Then the Token Administration panel is visible
    And the panel shows tabs Identity, Supply, Properties, and Danger Zone

  Scenario: Identity change can be staged from the admin panel
    Given the user is on the detail page of their own upgradeable token
    When the user updates the image URL field in the Identity tab
    And the user clicks Stage for the identity change
    Then the staged changes list contains an image URL update entry
