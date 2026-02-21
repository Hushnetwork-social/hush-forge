Feature: Token Detail Page

  Scenario: Token detail shows contract hash and NeoTube link
    Given a token with contract hash "0xd2a4cff31913016155e38e474a2c06d08be276cf" exists on the devnet
    When the user navigates to /tokens/0xd2a4cff31913016155e38e474a2c06d08be276cf
    Then the contract hash "0xd2a4cff31913016155e38e474a2c06d08be276cf" is displayed on the page
    And a link to the NeoTube explorer for that contract is shown

  Scenario: Contract hash can be copied to clipboard
    Given the user is on the token detail page
    When the user clicks the copy icon next to the contract hash
    Then the contract hash is copied to the clipboard
    And a brief "Copied!" confirmation appears

  Scenario: Own token shows Update Token button
    Given the user is viewing a token they created
    Then an "Update Token" button is visible on the detail page

  Scenario: Third-party token shows no Update Token button
    Given the user is viewing a token created by another address
    Then no "Update Token" button is shown on the detail page

  Scenario: Missing factory data falls back to RPC token contract data
    Given a token that was not created through the Forge factory
    When the user navigates to its detail page
    Then the basic token info (name, symbol, total supply) is still shown
    And a note indicates the token was not created via Forge
