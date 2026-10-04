# API (v1)

Base URL:
- `https://{tenant}.api.evanyaconsulting.com`

## Health
- GET `/healthz`
- GET `/readyz`

## Auth
- POST `/v1/auth/register`
  - body: `{ "email": "...", "password": "..." }`
- POST `/v1/auth/confirm`
  - body: `{ "email": "...", "code": "123456" }`
- POST `/v1/auth/resend-code`
  - body: `{ "email": "..." }`
- POST `/v1/auth/forgot-password`
  - body: `{ "email": "..." }`
- POST `/v1/auth/confirm-forgot-password`
  - body: `{ "email": "...", "code": "...", "newPassword": "..." }`

## MFA (TOTP)
These require `accessToken` from Cognito login (UI obtains via hosted UI or SRP).
- POST `/v1/mfa/setup` body: `{ "accessToken": "..." }`
- POST `/v1/mfa/verify` body: `{ "accessToken": "...", "code": "123456" }`
- POST `/v1/mfa/preference` body: `{ "accessToken": "...", "enabled": true }`

## Users (Admin-only)
Requires Authorization: `Bearer <access_token>` and token includes `roles` with `"admin"`.
- GET `/v1/users?limit=20&cursor=...`
- GET `/v1/users/{userId}`
- POST `/v1/users` body: `{ "email":"...", "roles":["admin"], "tempPassword":"..." }`
- PATCH `/v1/users/{userId}` body: `{ "roles":[...], "status":"DISABLED" }`
- DELETE `/v1/users/{userId}`
- POST `/v1/users/{userId}/enable`
- POST `/v1/users/{userId}/disable`
- POST `/v1/users/{userId}/reset-password`

## Roles & permissions
- GET `/v1/roles` lists the built-in and custom roles and every permission code.
- POST `/v1/roles`, PUT `/v1/roles/{roleId}` (needs `roles.manage`) save a custom role. You can only switch on permissions you hold.
- GET `/v1/auth/me` returns the caller's effective `permissions`; the CaseManagement service enforces the incident ones from it.

| Permission | Meaning | Admin | Field worker |
| --- | --- | --- | --- |
| `users.read`, `users.invite`, `users.update`, `users.assign_roles`, `users.disable`, `users.delete`, `users.reset_password`, `roles.manage` | User management | Yes | No |
| `incidents.create` | Create incidents (and the drafts and people they need) | Yes | Yes |
| `incidents.read` | View incidents | Yes | Yes |
| `incidents.update` | Edit incidents (admins any; others only incidents they created) | Yes | Yes |

Custom roles get an incident permission only when an admin switches it on for that role.
Because field workers hold the incident permissions, assigning the Field worker role needs them too.
