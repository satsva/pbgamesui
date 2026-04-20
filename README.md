## Pickleball League Portal

Static browser portal for league users to view:

- Scheduled pickleball games
- Recent scores
- Leaderboard chart/table

Access is controlled by a league passcode. No user login/signup is required.

## Stack

- Plain HTML/CSS/JavaScript
- Supabase (views as data source)
- GitHub Pages (auto-deploy via GitHub Actions)

## Folder Structure

- `site/index.html` UI layout
- `site/styles.css` visual design
- `site/app.js` Supabase + filtering logic
- `site/config.js` environment and column mapping
- `.github/workflows/deploy-pages.yml` deployment workflow

## Configure Supabase

Edit `site/config.js` and fill in:

- `supabaseUrl`
- `supabaseAnonKey`
- view names and column names under `views`

This app is preconfigured for your described views:

- passcode view: `public.passcodeleagueid`
- scheduled games view: `vw_schdlgames`
- game contact view: `vw_schdlgames_contact` (`team_id`, `phones`, `player_phones`)
- scores view: `vw_rpt_ldrboard` filtered with `is_planned = false`
- leaderboard: computed in app from scores using `wins` (primary) then `points` (tiebreak)

`formid` and `league_id` are treated as equivalent identifiers in your data model.

## Required Behavior

1. User enters passcode.
2. App looks up league in passcodes view.
3. App filters all other views by league/form.
4. User can additionally filter by team search/dropdown.

## Leaderboard Logic

Leaderboard rows are generated from the score rows for the selected league:

1. Group score rows by team.
2. Sum `wins` and `points` for each team.
3. Sort by `wins` descending.
4. Break ties with `points` descending.

## GitHub Pages Deployment

1. Push to `main`.
2. In GitHub repo settings, enable Pages and select GitHub Actions as source.
3. Workflow `Deploy GitHub Pages` publishes `site/`.

## Security Note

Current setup is intentionally simple. Passcode validation is client-side via Supabase view. For stronger protection later, move passcode verification to a Supabase Edge Function and return only scoped data.

