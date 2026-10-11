# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Register `private-ai` as a Pi provider backed by the Privatemode proxyless API with the chat models `glm-5.3` (alias `glm-latest`), `glm-5.3-flash` (alias `glm-flash-latest`) and `gpt-oss-120b`.
- Forward the pi thinking level as `reasoning_effort` and map the response `reasoning` field to thinking.
- `/private-ai` shows provider status; `/private-ai <model-id>` switches the session model.

## [0.1.0](https://www.npmjs.com/package/@floez-werk/piagent-private-ai/v/0.1.0) - 2026-10-11

### Added

- Initial release.

<!-- [Unreleased] compares against the last tagged version; switch this link to
     compare/vX.Y.Z...HEAD once the first version is tagged. Every version
     heading links to its GitHub release page (created by release.yml); 0.1.0
     has no tag yet (the first publish is manual), so it links to npm. -->
[Unreleased]: https://github.com/FloezWerk/piagent-private-ai/commits/main