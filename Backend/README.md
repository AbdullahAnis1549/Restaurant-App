# Restaurant App backend

Express/MongoDB backend component for the mobile restaurant customer/admin application. Includes authenticated REST APIs, Socket.IO chat, catalog management, authoritative checkout/delivery policies, Stripe test-mode payments, Google sign-in verification, Firebase campaigns and account security.

## Local setup

Use Node.js 24. Run npm ci, copy .env.example to .env and configure your own private values locally. Start with npm run dev or npm start. The health endpoints are /api/health and /api/ready. Never commit .env, Firebase service-account files, signing keys, database dumps or live diagnostic output.

The source intentionally contains no default administrator password or personal seed email. Public registration creates customer accounts only. Bootstrap administrator access through an intentional private operator process. npm run seed is optional and destructive: it only runs outside production with SEED_ALLOW_RESET=true, SEED_DATABASE_NAME matching a named demo/test database, and strong SEED_ADMIN_PASSWORD/SEED_CUSTOMER_PASSWORD environment values. Never point demo seeding at real application data. Credentials are omitted from seed logs.

## Verification

Run npm test and npm run security:secrets -- --self-test. GitHub Actions runs both with no live credentials. security:production validates required deployment configuration; security:atlas inspects the connected database role/TLS. Diagnostic scripts under scripts/ use temporary synthetic databases and require separate operator permissions; review each script before invoking it. Local reports and order-debug output are excluded from Git.

## Deployment boundary

This backend lives under Backend/ in the repository: use Root Directory Backend when importing it into a host. Run backend npm commands from that directory. The current src/server.js is a long-running Node entry point. Vercel deployment requires adapting its server initialization and continuous notification worker to the chosen Vercel execution model before considering the full chat/campaign system live-ready. No deployment is created by this push.

Production startup requires a real PUBLIC_API_URL, strong JWT/encryption configuration, verified database TLS and a database user scoped to readWrite on the application database. Keep SECURITY_DATA_KEY stable for existing authenticator data and use an independent BACKUP_ENCRYPTION_KEY for encrypted backups. Inject these through hosting secrets, never source files. Firebase credentials must be supplied through supported runtime credentials/environment configuration, not a committed JSON file. Keep Stripe in test mode for a portfolio demo and configure its signed webhook for the deployed endpoint.
