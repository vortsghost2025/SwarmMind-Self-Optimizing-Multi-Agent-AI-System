# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅ Yes    |

## Reporting a Vulnerability

If you discover a security vulnerability in SwarmMind, please **do not open a public
GitHub issue**. Instead, report it responsibly by emailing the maintainer or by using
[GitHub's private security-advisory feature](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability):

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Fill in the vulnerability details and submit.

We aim to acknowledge reports within **48 hours** and to provide a fix or mitigation
plan within **14 days** for confirmed issues.

## Scope

The following are in scope for this project:

- Prototype-pollution or injection via crafted task objects passed to agents.
- Supply-chain risks from npm dependencies (`npm audit` is run in CI).
- Information disclosure through logs or trace data.

Out-of-scope issues (e.g., social-engineering attacks against the repository
owner, or unrelated third-party services) will not be addressed here.

## Security Practices

- `node_modules/` is excluded from the repository; dependencies are installed
  fresh via `npm ci` using the committed `package-lock.json` with integrity hashes.
- CI runs `npm audit --audit-level=moderate` on every push and pull request.
- Dependabot is configured to send weekly pull requests for outdated npm packages.
