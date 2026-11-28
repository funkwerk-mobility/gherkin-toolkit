# Third-party dictionary notices

Cuke's own code is licensed under the MIT license in [LICENSE](LICENSE). Cuke uses the following separately licensed dictionaries. The versions below are those recorded in `package-lock.json`; review these notices when updating dependencies. The dictionary packages retain their own copyright and license notices.

| Package | Locked version | License declared by package | Source and notices |
| --- | --- | --- | --- |
| `@cspell/dict-en_us` | 4.4.43 | MIT | [Upstream source at the package's recorded commit](https://github.com/streetsidesoftware/cspell-dicts/tree/71a85e6b5fd23e601d7cca055e7bc46a0749ac32/dictionaries/en_US) |
| `@cspell/dict-en-gb` | 5.0.38 | LGPL-3.0; upstream README says LGPL-3.0-or-later | [Upstream source at the package's recorded commit](https://github.com/streetsidesoftware/cspell-dicts/tree/71a85e6b5fd23e601d7cca055e7bc46a0749ac32/dictionaries/en_GB) |
| `@cspell/dict-fr-fr` | 2.3.2 | MIT (package metadata; see upstream source notices) | [Upstream source at the package commit](https://github.com/streetsidesoftware/cspell-dicts/tree/627831379fe16dbfcfbf05fe747f05320b86e615/dictionaries/fr_FR) |
| `@cspell/dict-nb-no` | 3.0.0 | GPL-3.0-or-later | [Corresponding source and build instructions](https://github.com/streetsidesoftware/cspell-dicts/tree/d3774bca5ac5bc6e0e981d7f04cf050d6ac3aee2/dictionaries/nb_NO) |
| `dictionary-lb` | 4.0.0 | EUPL-1.1 | [Dictionary source and license](https://github.com/wooorm/dictionaries/tree/main/dictionaries/lb); [original project](https://github.com/spellchecker-lu/dictionary-lb-lu) |
| `@cspell/dict-de-de` | 4.1.4 | LGPL-3.0 | [Upstream source at the package's recorded commit](https://github.com/streetsidesoftware/cspell-dicts/tree/7d444af3ba4b8c41f71261c0b1586d037f3e8220/dictionaries/de_DE) |

The installed British and German packages include their LGPL license text in `LICENSE` and the GPL text it incorporates in `COPYING`. The German package also identifies additional notices for its source word lists; see its README and `src/hunspell/license` and `src/German_de_DE.txt` in the upstream source. The British package's README identifies the dictionary as derived from other sources. Consult the package and upstream source for the original copyright notices and applicable terms.

Cuke reads prebuilt dictionary files from separately installed packages. If distributing those packages, modified dictionaries, or a bundle containing them, retain the applicable notices and license texts, ensure recipients can obtain the corresponding source as required, and preserve their ability to replace or modify the LGPL-covered components. Verify the requirements for the actual distribution; source links here are provenance references and are not by themselves a determination of compliance.

These notices cover the spelling dictionaries, not the full dependency tree. Review other dependencies and their licenses before release.

The Norwegian package includes GPL and upstream source notices, and its prebuilt dictionary is generated from the source word lists and build tooling linked above. When distributing the generated dictionary, provide its complete corresponding source and license notices as GPL-3.0 requires; a source link alone may not satisfy every distribution method. The Luxembourgish package contains the original Hunspell dictionary and affix files with its EUPL-1.1 license. Retain their copyright and license notices when distributing them. The French package declares MIT but includes notices for its upstream source dictionary; review those notices as well.
