# Changelog

## [0.11.0](https://github.com/guneet-xyz/mon/compare/v0.10.1...v0.11.0) (2026-11-21)


### Features

* agents check each monitor at its own interval ([#81](https://github.com/guneet-xyz/mon/issues/81)) ([3f5ead0](https://github.com/guneet-xyz/mon/commit/3f5ead03ce55fde59c2bfa3550e1463100d18a9f))
* link monitor dialogs to the site or repo, fix the docs demo link ([#75](https://github.com/guneet-xyz/mon/issues/75)) ([1c6eeb0](https://github.com/guneet-xyz/mon/commit/1c6eeb0a15898fdb514fe777d7b2d98eb93d46a7))
* notify on monitor state changes via ntfy or a webhook ([#80](https://github.com/guneet-xyz/mon/issues/80)) ([b1774db](https://github.com/guneet-xyz/mon/commit/b1774db768484c1efa5eaaf4ecf5926ecae9f57d))
* **website:** make problems readable at a glance on tiles and groups ([#82](https://github.com/guneet-xyz/mon/issues/82)) ([574e55e](https://github.com/guneet-xyz/mon/commit/574e55e93caa938c7bb9c53eda79f34c67aa5321))


### Bug Fixes

* keep the last good config when the config file is invalid ([#79](https://github.com/guneet-xyz/mon/issues/79)) ([9fd21d0](https://github.com/guneet-xyz/mon/commit/9fd21d052ea3857d7299f2b2463b4083dfeb34a4))
* only return GitHub check runs for configured GitHub tiles ([#76](https://github.com/guneet-xyz/mon/issues/76)) ([836b12a](https://github.com/guneet-xyz/mon/commit/836b12a7be5c4b2a5fc39c4b032f75b4a9622674))
* **website:** clearer monitor dialogs: stale values, light mode, wording, uptime coverage ([#84](https://github.com/guneet-xyz/mon/issues/84)) ([bbfffd0](https://github.com/guneet-xyz/mon/commit/bbfffd049a196b4b90516a52f4ecf25befc80c71))

## [0.10.1](https://github.com/guneet-xyz/mon/compare/v0.10.0...v0.10.1) (2026-11-16)


### Bug Fixes

* **deps:** resolve open Dependabot security alerts ([#70](https://github.com/guneet-xyz/mon/issues/70)) ([d56f04b](https://github.com/guneet-xyz/mon/commit/d56f04be0aec79230c441295ac74bbdb25ff8ac7)), closes [#69](https://github.com/guneet-xyz/mon/issues/69)

## [0.10.0](https://github.com/guneet-xyz/mon/compare/v0.9.0...v0.10.0) (2026-11-14)


### Features

* **agent:** read the token from AGENT_TOKEN_FILE ([#67](https://github.com/guneet-xyz/mon/issues/67)) ([d54356c](https://github.com/guneet-xyz/mon/commit/d54356c184d3189f731e2e322a71c7800b175e59)), closes [#66](https://github.com/guneet-xyz/mon/issues/66)

## [0.9.0](https://github.com/guneet-xyz/mon/compare/v0.8.0...v0.9.0) (2026-11-14)


### Features

* agent tiles report their machine's CPU, memory and disk ([#64](https://github.com/guneet-xyz/mon/issues/64)) ([adf4a33](https://github.com/guneet-xyz/mon/commit/adf4a33c941ca0f38db0d3700d45369a3e0f6dc5)), closes [#63](https://github.com/guneet-xyz/mon/issues/63)

## [0.8.0](https://github.com/guneet-xyz/mon/compare/v0.7.0...v0.8.0) (2026-11-13)


### Features

* record and present richer monitor data ([#61](https://github.com/guneet-xyz/mon/issues/61)) ([49d8964](https://github.com/guneet-xyz/mon/commit/49d8964cc12ba23c011cd9f621be8a353e27cf0f)), closes [#60](https://github.com/guneet-xyz/mon/issues/60)

## [0.7.0](https://github.com/guneet-xyz/mon/compare/v0.6.0...v0.7.0) (2026-11-13)


### Features

* nested groups, initial_state and expanded size bounds ([#58](https://github.com/guneet-xyz/mon/issues/58)) ([954dff3](https://github.com/guneet-xyz/mon/commit/954dff33d759e7bd8d651b8f0d831082abb590d1))

## [0.6.0](https://github.com/guneet-xyz/mon/compare/v0.5.0...v0.6.0) (2026-11-13)


### Features

* show full tile names when they fit ([#55](https://github.com/guneet-xyz/mon/issues/55)) ([bd8541c](https://github.com/guneet-xyz/mon/commit/bd8541c8478616edd2b8f1066be0bf707152bdf3))

## [0.5.0](https://github.com/guneet-xyz/mon/compare/v0.4.0...v0.5.0) (2026-11-12)


### Features

* expand groups in place with an animation ([#52](https://github.com/guneet-xyz/mon/issues/52)) ([d03fb8e](https://github.com/guneet-xyz/mon/commit/d03fb8ebb6253714bea740b02fd2833b957bdfab)), closes [#51](https://github.com/guneet-xyz/mon/issues/51)

## [0.4.0](https://github.com/guneet-xyz/mon/compare/v0.3.0...v0.4.0) (2026-11-12)


### Features

* expand group tiles into a subgrid ([#48](https://github.com/guneet-xyz/mon/issues/48)) ([eaea165](https://github.com/guneet-xyz/mon/commit/eaea16523af5b9f27ba5893590eeae79087caee0))

## [0.3.0](https://github.com/guneet-xyz/mon/compare/v0.2.1...v0.3.0) (2026-11-12)


### Features

* add group tiles ([#45](https://github.com/guneet-xyz/mon/issues/45)) ([497be64](https://github.com/guneet-xyz/mon/commit/497be649a1a3242f8a1552803acb8bf8d1e00f9b)), closes [#44](https://github.com/guneet-xyz/mon/issues/44)
