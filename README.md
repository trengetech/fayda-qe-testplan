# Fayda two-phone test plan

A small shared web page for QE to run the Fayda two-phone test: mark each step **Pass / Fail / Blocked / Skip**, comment, and add or fix steps. Everyone sees the same results, and results can be downloaded as CSV.

The page is plain HTML, CSS and JavaScript (no libraries, no build). It talks straight to a Supabase database, in its own schema `qe`.

## For testers

1. Open the page and type your name, the run (for example `Run 1`), the build and the phones you use.
2. Work down the steps. Phone A runs the Seller app, phone B the Buyer app.
3. Press **Pass**, **Fail**, **Blocked** or **Skip**. A **Fail** needs a comment saying what happened.
4. **Comment** adds a note to a step. **Edit step** fixes the wording. **+ Add step** adds a step to a section. **Remove step** hides a step (nothing is ever deleted).
5. Change the **Run** box to start a fresh run. Earlier runs stay.
6. **Copy link** shares the page. **Download CSV** gives the full history of the run.

Anyone with the link can mark steps, comment and edit steps; there is no password (a small trusted group, by choice). Your name is stored in your browser only and sent with each mark.

## For the maintainer: setup (once)

1. **Database.** Run `db/schema.sql`. Then run `python3 db/plan.py`, which writes `db/seed.sql` (the starting 22 steps, taken from `docs/DEMO_SCRIPT.md` in the Fayda repo), and run that too. Both SQL files are safe to run again and only touch the `qe` schema.
2. **Close the app tables to the public key.** Supabase gives its public key rights on `public` by default. Run once on the same database:
   ```sql
   revoke all on all tables in schema public from anon, authenticated;
   revoke all on all sequences in schema public from anon, authenticated;
   revoke all on all functions in schema public from anon, authenticated;
   alter default privileges in schema public revoke all on tables from anon, authenticated;
   alter default privileges in schema public revoke all on sequences from anon, authenticated;
   alter default privileges in schema public revoke all on functions from anon, authenticated;
   revoke usage on schema public from anon, authenticated;
   ```
   Without this, anyone who opens this page could use its key to read or change the app's tables.
3. **Expose the schema.** In the Supabase dashboard: Project Settings, API, "Exposed schemas": add `qe` (keep `public` out if you can). Save.
4. **Point the page at the database.** Put the project URL and the **anon** (public) key in `config.js`. Never put the `service_role` key or the database password here: everything in this repo is public.
5. **Publish.** GitHub, Settings, Pages, Source: "Deploy from a branch", branch `main`, folder `/ (root)`.

## What the public key can and cannot do

Checked on 1 Nov 2026 by running as the `anon` role:

| Allowed | Refused |
|---|---|
| Read steps, results, comments | Delete anything |
| Add results and comments | Change or delete a result or a comment |
| Add steps; edit a step's text, section, position, archived flag | Change who created a step |
| | Anything in `public`, `auth`, `drizzle` |

Field lengths and the status values are enforced by the database. Everything typed into the page is shown as text, never as markup, and CSV cells that start with `=`, `+`, `-` or `@` are neutralised so a comment cannot run as a spreadsheet formula.

## Files

- `index.html`, `styles.css`, `app.js`, `config.js`: the page.
- `db/schema.sql`: tables, row rules, privileges.
- `db/plan.py`: the starting plan; `python3 db/plan.py` writes `db/seed.sql`.

## Known limits

- No individual sign-in: a mark carries whatever name the person typed, so anyone can mark as anyone.
- The page loads up to 10,000 results at once and refreshes every 20 seconds. Plenty for a test plan, not for a large team.
- A step's wording can be edited by anyone and the old wording is not kept.
