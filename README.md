# Restaurant App

Restaurant ordering/customer-support platform. The repository uses separate application directories.

## Layout

- Backend/: Express/MongoDB REST APIs, Socket.IO chat, Firebase campaigns, authentication/security, checkout/delivery rules and backend tests.
- Frontend/: React Native/Expo mobile application; its import will be added in a later commit. The existing local frontend has not been published by this restructuring.
- .github/workflows/verify.yml: backend checks, with frontend checks enabled automatically when its source is imported.

## Backend

From Backend/, run npm ci, configure a private .env using .env.example, then npm run dev. Run npm test and npm run security:secrets -- --self-test for verification. See Backend/README.md for credential, seed and operational details.

## Hosting

For a repository import into Vercel, the backend Root Directory is Backend. The current Node entry point and continuous campaign worker still require the Vercel execution-model adaptation described in Backend/README.md. This repository change does not deploy the application.

## Confidential files

Environment files, Firebase private service accounts/client config files, signing keys, database exports/backups, local reports, build output and dependency folders are excluded. Copy safe examples and supply your own private runtime configuration; never paste private credentials into issues, screenshots or commits.

Existing backend commits are preserved. This layout change is a normal commit, not a history rewrite or force push.
