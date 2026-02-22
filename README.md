# Demo

Next.js app with login, signup, and role-based dashboards (student, professor, admin). MVP for demo purposes.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Root is the **login** page.

## Flow

1. **Sign up** — New users sign up at `/signup`. They get a profile with **no role** (pending).
2. **Pending** — After login, if the user has no role yet, they see a "Account pending" page until an admin assigns a role.
3. **Admin** — An admin logs in and goes to the admin dashboard. They see **pending signups**, choose a role (student / professor / admin), and click **Assign role**.
4. **Login** — Once a role is set, the user can log in and is redirected to their role dashboard (`/dashboard/student`, `/dashboard/professor`, or `/dashboard/admin`). (Email notification on role assignment can be added later.)

## Environment

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Used only in the assign-role API (server-side)

## First admin

Roles are stored in `user_profiles.role`. New signups have `role = NULL` until an admin assigns one. You must set at least one user as admin in the database (e.g. in Supabase SQL Editor):

```sql
UPDATE public.user_profiles
SET role = 'admin'
WHERE email = 'your-admin@example.com';
```

Then log in with that email to access the admin dashboard and assign roles to pending users.
