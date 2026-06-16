# HR Guru HRMS Server

Backend scaffold for the HRMS application.

## Stack

- Node.js
- Express
- PostgreSQL
- Prisma
- Zod validation
- JWT/session auth middleware

## Setup

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:4000/health
```

## Next Steps

1. Add Prisma schema from `../docs/schema.sql`.
2. Run first migration.
3. Implement Auth.
4. Implement Employee Master.
5. Migrate frontend one module at a time from local storage to API calls.
