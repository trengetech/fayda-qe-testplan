# Fayda two-phone test plan

A small shared web page for QE to run the Fayda two-phone test: mark each step **Pass / Fail / Blocked / Skip**, comment, and add or fix steps. Everyone sees the same results, and results can be downloaded as CSV.

The page is plain HTML, CSS and JavaScript (no libraries, no build). It talks straight to a Supabase database, in its own schema `qe`.

## For testers

1. Open the page and enter the access secret (you get it from whoever shared the link; the page remembers it on that device until you press **Lock**). Then type your name, the run (for example `Run 1`), the build and the phones you use.
2. Work down the steps. Phone A runs the Seller app, phone B the Buyer app.
3. Press **Pass**, **Fail**, **Blocked** or **Skip**. A **Fail** needs a comment saying what happened.
4. **Comment** adds a note to a step. **Edit step** fixes the wording. **+ Add step** adds a step to a section. **Remove step** hides a step (nothing is ever deleted).
5. Change the **Run** box to start a fresh run. Earlier runs stay.
6. **Copy link** shares the page. **Download CSV** gives the full history of the run.

Anyone who has the link and the secret can mark test cases, comment and edit test cases (a small trusted group, by choice; one shared secret, no individual accounts). Your name is stored in your browser only and sent with each mark.

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
4. **Set the access secret** (see above) and **point the page at the database.** Put the project URL and the **anon** (public) key in `config.js`. Never put the `service_role` key or the database password here: everything in this repo is public.
5. **Publish.** GitHub, Settings, Pages, Source: "Deploy from a branch", branch `main`, folder `/ (root)`.

## Access secret

The test cases, results and comments are readable and writable only with one shared secret. The page asks for it and sends it with every request in the header `x-qe-secret`; the database compares it with a stored bcrypt hash (`qe.secret_ok()` in `db/schema.sql`) and returns nothing otherwise. So the check cannot be skipped by calling the database directly with the public key.

Set or change the secret once, as the database owner (never put the secret in a file or in this repo):

```sql
insert into qe.access (secret_hash) values (extensions.crypt('<the secret>', extensions.gen_salt('bf', 10)))
on conflict (id) do update set secret_hash = excluded.secret_hash;
```

Testers who had the old secret are asked for the new one on their next refresh.

**What the secret does not protect:** this web page's own files (HTML, CSS, JavaScript, this README, `db/schema.sql`) and the APKs in `downloads/` are served publicly by GitHub Pages and anyone who knows or guesses their address can fetch them. Only the data in the database is locked. Protecting the APK files too needs a private host.

## What the public key can and cannot do

Checked on 1 Nov 2026 by running as the `anon` role, **with the secret** (without it: reads return no rows and every write is refused):

| Allowed | Refused |
|---|---|
| Read steps, results, comments | Delete anything |
| Add results and comments | Change or delete a result or a comment |
| Add steps; edit a step's text, section, position, archived flag | Change who created a step |
| | Anything in `public`, `auth`, `drizzle` |

Field lengths and the status values are enforced by the database. Everything typed into the page is shown as text, never as markup, and CSV cells that start with `=`, `+`, `-` or `@` are neutralised so a comment cannot run as a spreadsheet formula.

## Case text formatting

Descriptions can use a little formatting: a line starting with `- ` is a bullet, `**bold**`, `[text](https://link)` and bare `https://` links. A link may only be `https://...` or a file in `downloads/`; anything else is shown as plain text.

## Downloads

`downloads/` holds the phone APKs the first test case links to (with `SHA256SUMS.txt`). To replace them after a new build, see the release runbook in the Fayda repo (`infra/README.md`). The APKs are public: they talk to the dev server with simulated sign-in.

## Updating the page

GitHub Pages lets browsers keep a page for up to 10 minutes. When you change `app.js`, `styles.css` or `config.js`, also raise the `?v=` number on their lines in `index.html`, so a browser that loads the new page always loads the new script. Someone who still sees old behaviour (for example raw `**bold**` markers) should hard-refresh (Cmd+Shift+R) or wait 10 minutes.

## Files

- `index.html`, `styles.css`, `app.js`, `config.js`: the page.
- `downloads/`: the APKs and their checksums.
- `db/schema.sql`: tables, row rules, privileges.
- `db/plan.py`: the starting plan; `python3 db/plan.py` writes `db/seed.sql`.

## Known limits

- No individual sign-in: a mark carries whatever name the person typed, so anyone can mark as anyone.
- The page loads up to 10,000 results at once and refreshes every 20 seconds. Plenty for a test plan, not for a large team.
- A step's wording can be edited by anyone and the old wording is not kept.
