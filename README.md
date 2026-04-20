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

## Feature Controls (Supabase)

This project includes a generic feature control table migration at:

- `supabase/migrations/202604200001_feature_controls.sql`

It creates `public.feature_controls`, which supports:

- global controls (`scope = 'global'`)
- league-specific overrides (`scope = 'league'` + `league_id`)

The `notify-match-result` Edge Function now checks these feature keys before sending emails:

- `email_notifications` (master email toggle)
- `notify_match_result_email` (match-result email toggle)

If either is disabled for the current league (or globally), the function skips sending and returns success with `skipped: true`.

### Common SQL operations

Disable all emails globally:

```sql
update public.feature_controls
set is_enabled = false
where feature_key = 'email_notifications'
	and scope = 'global'
	and league_id is null;
```

Disable only match-result emails globally:

```sql
update public.feature_controls
set is_enabled = false
where feature_key = 'notify_match_result_email'
	and scope = 'global'
	and league_id is null;
```

Disable match-result emails for one league:

```sql
insert into public.feature_controls (feature_key, scope, league_id, is_enabled, description)
values (
	'notify_match_result_email',
	'league',
	'YOUR_LEAGUE_ID',
	false,
	'Temporarily disable match emails for this league.'
)
on conflict (feature_key, scope, league_id)
do update set
	is_enabled = excluded.is_enabled,
	description = excluded.description,
	updated_at = now();
```

