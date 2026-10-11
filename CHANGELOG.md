# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `privateAi` settings key to choose the connection mode: `proxyless` (default, hosted proxyless API) or `proxy` (local/remote Privatemode proxy with configurable `proxyBaseUrl` and `proxyApiKey`).
- The provider registers at extension load by reading `privateAi` from the user-level `settings.json` directly, so the models show up without a session (`pi --list-models`, startup model selection); `session_start` re-registers with the fully merged settings, adding trusted project-level `privateAi` values.
- `/private-ai` status now shows the connection mode and effective base URL.
- Standard pi authentication for the provider: `/login private-ai` stores the API key in `auth.json` (stored credential wins over `PRIVATEMODE_API_KEY` and `privateAi.proxyApiKey`), `/private-ai` shows the resolved auth source.

## [0.1.0](https://www.npmjs.com/package/@floez-werk/piagent-private-ai/v/0.1.0) - 2026-10-11

### Added

- Initial release.

<!-- [Unreleased] compares against the last tagged version; switch this link to
     compare/vX.Y.Z...HEAD once the first version is tagged. Every version
     heading links to its GitHub release page (created by release.yml); 0.1.0
     has no tag yet (the first publish is manual), so it links to npm. -->
[Unreleased]: https://github.com/FloezWerk/piagent-private-ai/commits/main