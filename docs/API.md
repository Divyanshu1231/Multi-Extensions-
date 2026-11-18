# API Reference
Base path: `/api/v1`

- `POST /admin/login` — Super Admin login; returns 8-hour admin access JWT.
- `GET /admin/dashboard` — aggregate counts.
- `GET /extensions` — list registered extensions and user counts.
- `POST /extensions` — register an extension.
- `GET /extensions/{id}` — extension details.
- `PATCH /extensions/{id}` — enable/disable; disabling revokes sessions.
- `POST /extensions/{id}/users` — create extension-scoped user.
- `GET /extensions/{id}/users` — list users for one extension.
- `PATCH /users/{id}/status` — activate/deactivate user.
- `POST /users/{id}/reset-password` — reset password and revoke sessions.
- `GET /activity-logs` — recent audit events.
- `POST /auth/login` — extension-scoped login.
- `POST /auth/refresh` — one-time refresh token rotation.
- `POST /auth/logout` — revoke current session.
- `GET /auth/me` — current extension user/session.
- `POST /admin/sessions/revoke?user_id={id}` — revoke all user sessions.

Every extension login must send its logical key (`extension-01`…`extension-05`). A user lookup is scoped by both extension and username.
