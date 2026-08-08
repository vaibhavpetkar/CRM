# Changelog

All notable changes to this project will be documented in this file.

---

## [v1.0.0] - 2026-08-08

### 🚀 Initial Production Release

This is the first production-ready release of **CRM Pro** — a full-featured Customer Relationship Management system built with Next.js (frontend) and Express + TypeScript (backend).

---

### ✨ Features

#### Core CRM Modules
- **Leads Management** — Full lead lifecycle with timeline, scoring, status tracking, and RFQ fields
- **Deals & Pipeline** — Kanban-style pipeline view with deal stages and value tracking
- **Contacts** — Contact directory linked to leads, deals, and companies
- **Quotes** — Create, revise, approve, and send quotes with PDF generation
- **Invoices** — Invoice management with payment tracking
- **Payments** — Payment records linked to invoices

#### Team & Settings
- **Team Management** — Invite users, assign roles, manage departments
- **Roles & Permissions** — Granular role-based access control system
- **Company Settings** — Company profile, logo, and configuration
- **Activity Logs** — Full audit trail of all user actions
- **Recycle Bin** — Restore soft-deleted records

#### Marketing
- **Campaigns** — Email campaign management
- **Templates** — Reusable email templates
- **Analytics** — Campaign performance tracking

#### Real-Time
- **Socket.IO Notifications** — Live in-app notifications via Redis adapter
- **WebSocket Support** — Full WebSocket proxying through Nginx

#### Auth & Security
- **JWT Authentication** — Secure token-based auth with 7-day expiry
- **Google OAuth** — One-click Google login support
- **Email Verification** — Password reset and invite flows via email

---

### 🐳 DevOps & Infrastructure

- **Dockerized** — Multi-stage Dockerfiles for both frontend and backend
- **Docker Compose** — Full orchestration of frontend, backend, PostgreSQL, and Redis
- **CI/CD Pipeline** — GitHub Actions auto-deployment to VPS on every push to `master`
- **Auto Nginx Reload** — Host Nginx config auto-updated on every deploy
- **Host Nginx Integration** — Runs alongside existing VPS Nginx (no Docker Nginx conflict)
- **Standalone Next.js** — Optimized `output: standalone` build for minimal Docker image size

---

### 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TailwindCSS 4, TypeScript |
| Backend | Node.js 20, Express 4, TypeScript, Sequelize 6 |
| Database | PostgreSQL 15 |
| Cache / Realtime | Redis 7, Socket.IO 4 |
| Reverse Proxy | Nginx (host-level) |
| Container | Docker + Docker Compose |
| CI/CD | GitHub Actions + SSH Deploy |

---

### 🔐 Default Admin Credentials (change immediately after deploy)

- **Email**: `admin@crmpro.com`
- **Password**: Set via `SUPER_ADMIN_PASSWORD` environment variable

---

### ⚙️ Environment Variables Required

See `backend/.env.production.example` and `frontend/.env.production.example` for full configuration reference.

---

[v1.0.0]: https://github.com/vaibhavpetkar/CRM/releases/tag/v1.0.0
