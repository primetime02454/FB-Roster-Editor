# Firebase Hosting Setup

This repo is wired for the same split deployment pattern as your other project:

- Firebase Hosting serves the built frontend from `frontend/dist`
- A backend service can be deployed separately to Cloud Run

## Local Firebase Hosting

```powershell
npm install
npm run serve:hosting
```

That serves the Vite build through the Firebase Hosting emulator.

## Production Hosting

Pick a Firebase project first, then either:

```powershell
npx firebase-tools use --add
```

or:

```powershell
npx firebase-tools deploy --only hosting --project YOUR_PROJECT_ID
```

## Backend API

The backend can be deployed to Cloud Run with:

```powershell
npm run deploy:api
```

This requires the Google Cloud CLI to be installed and authenticated.
The deploy uses a larger Cloud Run instance size so roster parsing does not run out of memory on uploads.
