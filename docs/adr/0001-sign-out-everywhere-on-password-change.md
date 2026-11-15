# Sign out everywhere when the password changes

Sessions are stateless signed cookies (7 days), so changing a password used to leave every existing session working — useless when a reset means "someone may have my password". Each account now records when its password last changed, and a session issued before that moment is rejected, so a password reset signs the account out on every other device.

## Considered Options

- **A sessions table** (revoke rows on reset): full control and per-device sign-out, but a table and a lookup per request for a feature we only need at password change.
- **A per-account signing secret** rotated on reset: no new column, but every token check needs the account's secret before it can verify, and it couples sessions to key management.
- **Password-changed-at on the account** (chosen): one nullable column; the session check compares the token's issue time against it.

## Consequences

Session checks are no longer pure signature checks: they read the account's password-changed-at, so the session cookie alone is not enough to authenticate. The account that resets keeps its new session (issued after the change). Any future "sign out of all devices" button can reuse the same column.
