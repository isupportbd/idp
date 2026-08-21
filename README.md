# IDP Project (Monorepo)

This project is built using a modern full-stack web architecture. It is structured as a monorepo containing two main applications:
- **`apps/api`**: The backend server.
- **`apps/web`**: The frontend web application.

---

## 🛠️ Technology Stack

### Backend (`apps/api`)
- **Runtime Environment:** [Bun](https://bun.sh/) (Fast all-in-one JavaScript runtime)
- **Web Framework:** [Hono](https://hono.dev/) (Ultrafast web framework built on Web Standards)
- **Database:** PostgreSQL
- **ORM (Object-Relational Mapping):** [Drizzle ORM](https://orm.drizzle.team/)
- **Database Driver:** `postgres.js`
- **Authentication & Security:** 
  - `jsonwebtoken` (JWT for stateless API authentication)
  - `bcryptjs` (Password hashing)
- **Validation:** `Zod` (TypeScript-first schema validation)
- **Email Service:** `nodemailer` (For sending OTPs and notifications)

### Frontend (`apps/web`)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Library:** [React](https://react.dev/) (with TypeScript)
- **Routing:** `react-router-dom`
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) (Utility-first CSS framework)
- **State Management:** 
  - `Zustand` (For global application state, e.g., Auth)
  - `@tanstack/react-query` (For data fetching and caching)
- **Icons:** `lucide-react`
- **HTTP Client:** `hono/client` (RPC-like type-safe API client generated from the backend)

---

## 🚀 Key Features of the Stack
1. **End-to-End Type Safety:** By using Hono RPC and Zod, the frontend knows exactly what types the backend expects and returns without maintaining separate OpenAPI specs.
2. **Extreme Performance:** Combining Bun on the backend and Vite on the frontend provides blazing fast startup and execution times.
3. **Developer Experience (DX):** Drizzle ORM provides a great SQL-like syntax with full TypeScript support, and Drizzle Studio provides a built-in database viewer.
