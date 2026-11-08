# dashboard.bridgerjones.com

Just the page. Permuta (the Mac app) controls it: layout, widgets and live data are saved in Supabase (`dash_kv`) by Permuta;
this app only reads them and talks to Home Assistant for the touch controls.

- `src/app/page.tsx` the standby display and the touch controller
- `/api/screen` Permuta's config and live state (+ weather); `/api/home` and `/api/act` Home Assistant
- Every endpoint needs the control PIN. Permuta sets it (it's stored hashed in Supabase, with a lock-out after 8 wrong tries); the device keeps it after one unlock.

Environment: `SUPABASE_URL`, `SUPABASE_KEY` (the publishable key), `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN`. No other secrets live here.
The old app is archived in Permuta/Dashboard (with its git history).
