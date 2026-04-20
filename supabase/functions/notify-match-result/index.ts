import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@3";

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";
const BCC_EMAIL = Deno.env.get("BCC_EMAIL") ?? Deno.env.get("BCC_EMAILS") ?? "";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Match Bot <no-reply@example.com>";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const resend = new Resend(RESEND_API_KEY);

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getRow(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const typed = payload as WebhookPayload;
  if (typed.record && typeof typed.record === "object") {
    return typed.record;
  }
  return payload as Record<string, unknown>;
}

function parseEmailList(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

async function isFeatureEnabled(
  supabaseAdmin: ReturnType<typeof createClient>,
  featureKey: string,
  leagueId?: string
): Promise<boolean> {
  if (leagueId) {
    const { data: leagueRow, error: leagueError } = await supabaseAdmin
      .from("feature_controls")
      .select("is_enabled")
      .eq("feature_key", featureKey)
      .eq("scope", "league")
      .eq("league_id", leagueId)
      .maybeSingle();

    if (leagueError) {
      throw leagueError;
    }

    if (leagueRow?.is_enabled !== undefined && leagueRow?.is_enabled !== null) {
      return Boolean(leagueRow.is_enabled);
    }
  }

  const { data: globalRow, error: globalError } = await supabaseAdmin
    .from("feature_controls")
    .select("is_enabled")
    .eq("feature_key", featureKey)
    .eq("scope", "global")
    .is("league_id", null)
    .maybeSingle();

  if (globalError) {
    throw globalError;
  }

  // If no control row exists, default to enabled.
  if (globalRow?.is_enabled === undefined || globalRow?.is_enabled === null) {
    return true;
  }

  return Boolean(globalRow.is_enabled);
}

async function areAllFeaturesEnabled(
  supabaseAdmin: ReturnType<typeof createClient>,
  featureKeys: string[],
  leagueId?: string
): Promise<boolean> {
  for (const featureKey of featureKeys) {
    const enabled = await isFeatureEnabled(supabaseAdmin, featureKey, leagueId);
    if (!enabled) {
      return false;
    }
  }
  return true;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const providedSecret = req.headers.get("x-webhook-secret") ?? "";
    if (!WEBHOOK_SECRET || providedSecret !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response("Missing required environment variables", { status: 500 });
    }

    const payload = await req.json();
    const row = getRow(payload);

    // Matches your current insert payload field names from the frontend app.
    const teamA = asString(row["Team A"]);
    const teamB = asString(row["Team B"]);
    const scores = asString(row.scores);
    const comments = asString(row.comments);
    const winningTeam = asString(row["Winning Team"]);
    const datePlayed = asString(row.date);
    const league = asString(row.formname);
    const leagueId = asString(row.league_id || row.formid || row.form_id || "");
    const round = asString(row.round);
    const submitterEmail = asString(row["Your Email"]);

    if (!teamA || !teamB) {
      return new Response("Missing team names in inserted row", { status: 400 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const shouldSendEmail = await areAllFeaturesEnabled(
      supabaseAdmin,
      ["email_notifications", "notify_match_result_email"],
      leagueId || undefined
    );

    if (!shouldSendEmail) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "email_notifications_disabled" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const { data: players, error: playersError } = await supabaseAdmin
      .from("team_players")
      .select("email, team_name")
      .in("team_name", [teamA, teamB])
      .eq("is_active", true);

    if (playersError) {
      console.error("Failed loading recipients:", playersError);
      return new Response("Failed to load team recipients", { status: 500 });
    }

    const teamRecipients = [
      ...new Set((players ?? []).map((player) => asString(player.email)).filter(Boolean))
    ];

    const adminRecipients = parseEmailList(ADMIN_EMAIL);
    const bccRecipients = parseEmailList(BCC_EMAIL);
    const to = teamRecipients.length ? teamRecipients : adminRecipients;
    const cc = teamRecipients.length
      ? [...new Set([...adminRecipients, submitterEmail].filter(Boolean))]
      : [...new Set([submitterEmail].filter(Boolean))];

    if (!to.length) {
      return new Response("No recipients configured. Set team_players and/or ADMIN_EMAIL.", {
        status: 500
      });
    }

    const subject = `${league || "League"}: ${teamA} vs ${teamB} - Score Submitted`;

    const html = `
      <h2>Match Result Submitted</h2>
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse: collapse;">
        <tr><td><strong>League</strong></td><td>${escapeHtml(league || "-")}</td></tr>
        <tr><td><strong>Round</strong></td><td>${escapeHtml(round || "-")}</td></tr>
        <tr><td><strong>Date Played</strong></td><td>${escapeHtml(datePlayed || "-")}</td></tr>
        <tr><td><strong>Team A</strong></td><td>${escapeHtml(teamA)}</td></tr>
        <tr><td><strong>Team B</strong></td><td>${escapeHtml(teamB)}</td></tr>
        <tr><td><strong>Scores</strong></td><td>${escapeHtml(scores || "-")}</td></tr>
        <tr><td><strong>Winning Team</strong></td><td>${escapeHtml(winningTeam || "-")}</td></tr>
        <tr><td><strong>Comments</strong></td><td>${escapeHtml(comments || "-")}</td></tr>
      </table>
      <p>For any corrections to the submitted scores, please contact help@startplay.app and copy all the team players.</p>
    `;

    const { error: sendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      cc: cc.length ? cc : undefined,
      bcc: bccRecipients.length ? bccRecipients : undefined,
      subject,
      html
    });

    if (sendError) {
      console.error("Resend send error:", sendError);
      return new Response("Email send failed", { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, sentTo: to.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("notify-match-result error:", error);
    return new Response("Internal server error", { status: 500 });
  }
});
