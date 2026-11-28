Feature: Format a feature file

  Scenario: Format an outline and its Examples table
    Given a feature file containing:
      """
      Feature: Eating cucumbers
      Scenario Outline: Eating
      Given there are <start> cucumbers
      When I eat  <eat> cucumbers
      Then I have <left> cucumbers
      Examples: Amounts
      |start|eat|left|
      |12|5|7|
      |20|5|15|
      """
    When I format it with Cuke
    Then the command succeeds
    And the feature file contains:
      """
      Feature: Eating cucumbers
      
        Scenario Outline: Eating
          Given there are <start> cucumbers
          When I eat <eat> cucumbers
          Then I have <left> cucumbers
      
          Examples: Amounts
            | start | eat | left |
            | 12    | 5   | 7    |
            | 20    | 5   | 15   |
      """
    And the feature file passes the formatting check
