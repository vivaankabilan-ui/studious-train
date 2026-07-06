# Cloudflare Setup

1. Create a D1 database in Cloudflare, for example `partime`.
2. Run the schema in `migrations/0001_init.sql` against that database.
3. Open the Pages project for ParTime.
4. Add a D1 binding named `DB` and point it at the database you created.
5. Redeploy the Pages project.

The app now reads and writes through `GET /api/state` and `POST /api/state`.

