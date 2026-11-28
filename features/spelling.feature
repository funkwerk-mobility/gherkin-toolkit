@spell.docstrings=off @spell.data-tables=off
Feature: Check spelling in a feature file

  Scenario: Check different languages and a custom dictionary
    Given a feature file containing:
      ```
      @spell.quotes=de @spell.tables=de @spell.docstrings=de
      @step-data-table-header=true
      Feature: Guess the word
      
        The Maker makes a word for the Breaker to guess.
      
        Scenario Outline: Breaker joins a game
          Given the Maker in Cukeland has started a game with the word "<word>"
          And the game shows the following messages:
            | message   | text       |
            | Begrüßung | Willkommen |
            | Hinweis   | Hinweiss   |
          When the Breaker joins the game
          Then the Breaker sees "Willkommen" and a remaning attempt count
          And the game displays:
            """
            Bitte versuchen Sie es erneut.
            """
      
          Examples: Words
            | word  |
            | Farbe |
            | Zug   |
      ```
    And a custom dictionary containing:
      """
      Cukeland
      !attempt
      """
    When I check its spelling with Cuke
    Then the check fails
    And the following spelling diagnostics are reported:
      | rule           | word     |
      | unknown-word   | Hinweiss |
      | unknown-word   | remaning |
      | forbidden-word | attempt  |
