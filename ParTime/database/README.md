# ParTime Database

This folder contains the standalone database schema for ParTime.

## Tables

- `users`
- `worker_profiles`
- `client_profiles`
- `parent_profiles`
- `jobs`
- `job_applications`
- `job_assignments`
- `ratings`
- `worker_rating_summary`
- `activity_log`

## Notes

- `schema.sql` is the Postgres version of the schema.
- `migrations/0001_init.sql` is the Cloudflare D1 version.
- The app now talks to `/api/state`, which is meant to run as a Cloudflare Pages Function.
- In Cloudflare, bind the D1 database to the function under the name `DB`.
