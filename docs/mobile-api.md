# Mobile app API guide

One mobile app can serve every company on the platform. A user signs in with
their **company code**, email and password, and every later request carries
the token they get back. The server works out the company from that token, so
the rest of the REST API (`/api/leads`, `/api/deals`, `/api/quotes`, ...) is
the same for every company and only ever returns the signed-in company's data.

Base URL: `https://<your-domain>/api`

## 1. Check the company code (optional)

```
GET /api/auth/company/:code
```

`200 { "company": { "name": "Inveon Technologies", "code": "inveon", "logo": null } }`
or `404` when no company has that code. Use it to show the company's name and
logo on the login screen before the user types a password.

## 2. Sign in

```
POST /api/auth/login
Content-Type: application/json

{ "companyCode": "inveon", "email": "user@example.com", "password": "..." }
```

`200`:

```json
{
  "token": "<JWT>",
  "user": { "id": 7, "firstName": "...", "role": { "name": "Sales Rep", "permissions": ["leads:read", "..."] } },
  "company": { "id": 1, "name": "Inveon Technologies", "code": "inveon", "logo": null }
}
```

A wrong company code, email or password all return
`400 { "message": "Invalid company code, email or password" }`.
Tokens last for `JWT_EXPIRES_IN` (default 7 days); sign in again on `401`.

## 3. Call the API

Send the token on every request:

```
Authorization: Bearer <JWT>
```

- `GET /api/auth/me` returns the user, their role and permissions, and the company.
- `GET /api/subscription` returns the company's plan, status and any alert
  (`alert.message`) to show as a banner.
- Use the role's `permissions` to hide screens the user can't open; the
  server enforces them too (`403`).

## 4. Errors to handle

| Status | Meaning | What the app should do |
| --- | --- | --- |
| `401` | Token missing, expired or user deactivated | Go back to the login screen |
| `402` with `code: "SUBSCRIPTION_LOCKED"` | Company's trial ended, payment overdue or blocked | Show `message` and a "contact your admin" screen; `GET /api/subscription` still works |
| `403` | Role doesn't allow this action | Show "You don't have access" |

## 5. Signing up a new company from the app (optional)

```
POST /api/auth/signup-company
{ "companyName": "Acme", "companyCode": "acme", "firstName": "...", "lastName": "...", "email": "...", "password": "..." }
```

Creates the company on a 15-day free trial and returns the same shape as
login. `companyCode` is optional; one is generated from the name when it's
left out.
