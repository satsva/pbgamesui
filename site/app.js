import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.APP_CONFIG;

const state = {
  leagueValue: null,
  leagueName: "",
  selectedTeam: "",
  teamSearch: "",
  activeTab: "games",
  detailMetric: "wins",
  games: [],
  scores: [],
  leaderboard: []
};

const els = {
  loginSection: document.getElementById("loginSection"),
  portalSection: document.getElementById("portalSection"),
  passcodeForm: document.getElementById("passcodeForm"),
  passcodeInput: document.getElementById("passcodeInput"),
  loginError: document.getElementById("loginError"),
  leagueTitle: document.getElementById("leagueTitle"),
  leagueSubtitle: document.getElementById("leagueSubtitle"),
  teamSearch: document.getElementById("teamSearch"),
  teamSelect: document.getElementById("teamSelect"),
  clearFilters: document.getElementById("clearFilters"),
  loadingState: document.getElementById("loadingState"),
  portalError: document.getElementById("portalError"),
  tabGames: document.getElementById("tabGames"),
  tabLeaderboard: document.getElementById("tabLeaderboard"),
  panelGames: document.getElementById("panelGames"),
  panelLeaderboard: document.getElementById("panelLeaderboard"),
  gamesAccordion: document.getElementById("gamesAccordion"),
  leaderboardTable: document.getElementById("leaderboardTable"),
  leaderboardDetailTable: document.getElementById("leaderboardDetailTable"),
  detailMetricRadios: document.querySelectorAll('input[name="detailMetric"]')
};

if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
  showLoginError("Configure site/config.js with Supabase URL and anon key.");
} else {
  wireEvents();
}

const supabase = config?.supabaseUrl
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

function wireEvents() {
  els.passcodeForm.addEventListener("submit", onPasscodeSubmit);
  els.teamSearch.addEventListener("input", (event) => {
    state.teamSearch = event.target.value.trim().toLowerCase();
    renderAll();
  });
  els.teamSelect.addEventListener("change", (event) => {
    state.selectedTeam = event.target.value;
    renderAll();
  });
  els.clearFilters.addEventListener("click", () => {
    state.selectedTeam = "";
    state.teamSearch = "";
    els.teamSelect.value = "";
    els.teamSearch.value = "";
    renderAll();
  });

  els.tabGames.addEventListener("click", () => setActiveTab("games"));
  els.tabLeaderboard.addEventListener("click", () => setActiveTab("leaderboard"));

  els.detailMetricRadios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      state.detailMetric = event.target.value;
      renderLeaderboardDetail();
    });
  });
}

async function onPasscodeSubmit(event) {
  event.preventDefault();
  hideLoginError();
  hidePortalError();

  const rawPasscode = els.passcodeInput.value.trim();
  if (!rawPasscode) {
    showLoginError("Enter a valid passcode.");
    return;
  }

  const passcodes = config.views.passcodes;
  const { data, error } = await supabase
    .from(passcodes.name)
    .select("*")
    .eq(passcodes.passcodeColumn, rawPasscode)
    .maybeSingle();

  if (error || !data) {
    showLoginError("Invalid passcode.");
    return;
  }

  state.leagueValue = data[passcodes.leagueColumn];
  state.leagueName = data[passcodes.leagueNameColumn] || String(state.leagueValue);

  els.loginSection.classList.add("hidden");
  els.portalSection.classList.remove("hidden");
  els.leagueTitle.textContent = state.leagueName;
  els.leagueSubtitle.textContent = `League key: ${state.leagueValue}`;

  await loadLeagueData();
}

async function loadLeagueData() {
  setLoading(true);
  hidePortalError();

  try {
    const [gamesRows, scoresRows] = await Promise.all([
      selectLeagueRows(config.views.games),
      selectLeagueRows(config.views.scores)
    ]);

    state.games = gamesRows;
    state.scores = scoresRows;
    state.leaderboard = computeLeaderboardFromScores(scoresRows);

    const scoreLeagueName =
      scoresRows.find((row) => row.formname && String(row.formname).trim())?.formname || "";
    if (scoreLeagueName) {
      state.leagueName = scoreLeagueName;
      els.leagueTitle.textContent = state.leagueName;
    }

    hydrateTeamDropdown();
    renderAll();
  } catch (error) {
    showPortalError(error.message || "Could not load league data.");
  } finally {
    setLoading(false);
  }
}

async function selectLeagueRows(viewConfig) {
  const runQuery = async (leagueColumn) => {
    let query = supabase.from(viewConfig.name).select("*");

    if (leagueColumn) {
      query = query.eq(leagueColumn, state.leagueValue);
    }

    if (viewConfig.plannedColumn !== undefined) {
      query = query.eq(viewConfig.plannedColumn, viewConfig.plannedValue ?? false);
    }

    return query;
  };

  const primaryColumn = viewConfig.leagueColumn;
  const fallbackColumn = viewConfig.alternateLeagueColumn;

  const primary = await runQuery(primaryColumn);
  if (!primary.error) {
    return primary.data || [];
  }

  if (fallbackColumn) {
    const fallback = await runQuery(fallbackColumn);
    if (!fallback.error) {
      return fallback.data || [];
    }
    throw new Error(`Query failed for ${viewConfig.name}: ${fallback.error.message}`);
  }

  throw new Error(`Query failed for ${viewConfig.name}: ${primary.error.message}`);
}

function hydrateTeamDropdown() {
  const set = new Set();
  const views = config.views;

  state.games.forEach((row) => {
    addTeam(set, row[views.games.teamColumn]);
    addTeam(set, row[views.games.homeTeamColumn]);
    addTeam(set, row[views.games.awayTeamColumn]);
  });
  state.scores.forEach((row) => {
    addTeam(set, row[views.scores.teamColumn]);
    addTeam(set, row[views.scores.opponentColumn]);
  });
  state.leaderboard.forEach((row) => addTeam(set, row[views.leaderboard.teamColumn]));

  const teams = [...set].sort((a, b) => a.localeCompare(b));
  els.teamSelect.innerHTML = '<option value="">All teams</option>';
  teams.forEach((team) => {
    const option = document.createElement("option");
    option.value = team;
    option.textContent = team;
    els.teamSelect.append(option);
  });
}

function addTeam(set, value) {
  if (value && String(value).trim()) {
    set.add(String(value).trim());
  }
}

function renderAll() {
  renderGames();
  renderLeaderboard();
  renderLeaderboardDetail();
}

function renderGames() {
  const view = config.views.games;
  const rows = state.games.filter((row) => {
    const teamBundle = [
      row[view.teamColumn],
      row[view.homeTeamColumn],
      row[view.awayTeamColumn],
      row.winner
    ];
    return teamMatch(teamBundle);
  });

  if (!rows.length) {
    els.gamesAccordion.innerHTML = "<p class=\"muted\">No games found for this filter.</p>";
    return;
  }

  const byRound = new Map();
  rows.forEach((row) => {
    const round = String(row.round || "Uncategorized");
    if (!byRound.has(round)) {
      byRound.set(round, []);
    }
    byRound.get(round).push(row);
  });

  const roundNames = [...byRound.keys()].sort(compareRoundLabel);
  els.gamesAccordion.innerHTML = roundNames
    .map((roundName, idx) => {
      const roundRows = byRound.get(roundName) || [];
      const tableRows = roundRows
        .map((row) => {
          const teamAName = String(row.team_a || row[view.homeTeamColumn] || "-");
          const teamBName = String(row.team_b || row[view.awayTeamColumn] || "-");
          const winner = String(row.winner || "").trim().toLowerCase();
          const teamA = appendWinnerCup(teamAName, winner === teamAName.trim().toLowerCase());
          const teamB = appendWinnerCup(teamBName, winner === teamBName.trim().toLowerCase());
          const scores = String(row.scores || "").trim() || "Pending";
          const comments = String(row.comments || "").trim();
          const commentCell = comments
            ? `<span class=\"comment-hover\" title=\"${escapeHtmlAttr(comments)}\" aria-label=\"Comment available\">&#128172;</span>`
            : "";

          return `<tr>
            <td>${teamA}</td>
            <td>${teamB}</td>
            <td>${escapeHtml(scores)}</td>
            <td>${commentCell}</td>
          </tr>`;
        })
        .join("");

      return `<details class="round-group" ${idx === 0 ? "open" : ""}>
        <summary>${escapeHtml(roundName)}</summary>
        <div class="round-content table-wrap">
          <table>
            <thead>
              <tr>
                <th>team_a</th>
                <th>team_b</th>
                <th>scores</th>
                <th>comments</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </details>`;
    })
    .join("");
}

function appendWinnerCup(teamName, isWinner) {
  const safeTeam = escapeHtml(teamName);
  return isWinner ? `${safeTeam}<span class="winner-tag">&#127942;</span>` : safeTeam;
}

function renderLeaderboard() {
  const view = config.views.leaderboard;
  const rows = state.leaderboard
    .filter((row) => teamMatch([row[view.teamColumn]]))
    .sort((a, b) => {
      const winsDiff = Number(b[view.winsColumn] ?? 0) - Number(a[view.winsColumn] ?? 0);
      if (winsDiff !== 0) return winsDiff;
      const pointsDiff = Number(b[view.pointsColumn] ?? 0) - Number(a[view.pointsColumn] ?? 0);
      if (pointsDiff !== 0) return pointsDiff;
      return String(a[view.teamColumn] || "").localeCompare(String(b[view.teamColumn] || ""));
    });

  els.leaderboardTable.innerHTML = rows.length
    ? `<table>
        <thead>
          <tr><th>Rank</th><th>Team</th><th>Wins</th><th>Points</th></tr>
        </thead>
        <tbody>
          ${rows
            .map((row, index) => {
              const rank = index + 1;
              const team = row[view.teamColumn] || "Team";
              const wins = row[view.winsColumn] ?? 0;
              const points = row[view.pointsColumn] ?? 0;
              return `<tr><td>${escapeHtml(String(rank))}</td><td>${escapeHtml(team)}</td><td>${escapeHtml(String(wins))}</td><td>${escapeHtml(String(points))}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>`
    : "<p class=\"muted\">No leaderboard data for this filter.</p>";
}

function renderLeaderboardDetail() {
  const metric = state.detailMetric;
  const rows = buildLeaderboardRoundMatrix(metric);
  if (!rows.columns.length || !rows.data.length) {
    els.leaderboardDetailTable.innerHTML = "<p class=\"muted\">No round detail available for this filter.</p>";
    return;
  }

  const colHeaders = rows.columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
  const body = rows.data
    .map((row) => {
      const values = rows.columns
        .map((col) => `<td>${escapeHtml(formatNumber(row.values[col] ?? 0, metric))}</td>`)
        .join("");
      return `<tr><td>${escapeHtml(row.team)}</td>${values}<td>${escapeHtml(formatNumber(row.total, metric))}</td></tr>`;
    })
    .join("");

  els.leaderboardDetailTable.innerHTML = `<table>
    <thead>
      <tr><th>Team</th>${colHeaders}<th>Grand Total</th></tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}

function buildLeaderboardRoundMatrix(metric) {
  const scoreView = config.views.scores;
  const roundSet = new Set();
  const teamMap = new Map();

  state.scores
    .filter((row) => teamMatch([row[scoreView.teamColumn], row[scoreView.opponentColumn]]))
    .forEach((row) => {
      const team = String(row[scoreView.teamColumn] || "").trim();
      if (!team) return;

      const round = String(row[scoreView.roundColumn] || "Round").trim();
      roundSet.add(round);

      if (!teamMap.has(team)) {
        teamMap.set(team, { team, values: {}, total: 0 });
      }

      const value =
        metric === "wins"
          ? Number(row[scoreView.winsColumn] ?? row[scoreView.winnerFlagColumn] ?? 0)
          : Number(row[scoreView.pointsColumn] ?? 0);

      const teamRow = teamMap.get(team);
      teamRow.values[round] = Number(teamRow.values[round] ?? 0) + value;
      teamRow.total += value;
    });

  const columns = [...roundSet].sort(compareRoundLabel);
  const data = [...teamMap.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.team.localeCompare(b.team);
  });

  return { columns, data };
}

function compareRoundLabel(a, b) {
  const numA = Number(String(a).match(/\d+/)?.[0] || 999999);
  const numB = Number(String(b).match(/\d+/)?.[0] || 999999);
  if (numA !== numB) return numA - numB;
  return String(a).localeCompare(String(b));
}

function formatNumber(value, metric) {
  if (metric === "wins") {
    return String(Math.round(value));
  }
  return Number(value).toFixed(2);
}

function setActiveTab(tab) {
  state.activeTab = tab;

  const isGames = tab === "games";
  els.tabGames.classList.toggle("active", isGames);
  els.tabGames.setAttribute("aria-selected", String(isGames));
  els.panelGames.classList.toggle("hidden", !isGames);

  els.tabLeaderboard.classList.toggle("active", !isGames);
  els.tabLeaderboard.setAttribute("aria-selected", String(!isGames));
  els.panelLeaderboard.classList.toggle("hidden", isGames);
}

function computeLeaderboardFromScores(scoreRows) {
  const scoreView = config.views.scores;
  const leaderboardView = config.views.leaderboard;
  const teams = new Map();

  scoreRows.forEach((row) => {
    const team = String(row[scoreView.teamColumn] || "").trim();
    if (!team) return;

    if (!teams.has(team)) {
      teams.set(team, {
        [leaderboardView.teamColumn]: team,
        [leaderboardView.winsColumn]: 0,
        [leaderboardView.pointsColumn]: 0
      });
    }

    const bucket = teams.get(team);
    bucket[leaderboardView.winsColumn] += Number(row[scoreView.winsColumn] ?? 0);
    bucket[leaderboardView.pointsColumn] += Number(row[scoreView.pointsColumn] ?? 0);
  });

  return [...teams.values()];
}

function teamMatch(values) {
  const selected = state.selectedTeam.trim().toLowerCase();
  const search = state.teamSearch.trim().toLowerCase();

  const bundle = values
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean)
    .join(" | ");

  const selectedOk = !selected || bundle.includes(selected);
  const searchOk = !search || bundle.includes(search);
  return selectedOk && searchOk;
}

function safeDate(value) {
  if (!value) return "Date TBA";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function showLoginError(message) {
  els.loginError.textContent = message;
}

function hideLoginError() {
  els.loginError.textContent = "";
}

function showPortalError(message) {
  els.portalError.textContent = message;
  els.portalError.classList.remove("hidden");
}

function hidePortalError() {
  els.portalError.textContent = "";
  els.portalError.classList.add("hidden");
}

function setLoading(enabled) {
  els.loadingState.classList.toggle("hidden", !enabled);
}

function resetPortal() {
  state.leagueValue = null;
  state.leagueName = "";
  state.selectedTeam = "";
  state.teamSearch = "";
  state.activeTab = "games";
  state.detailMetric = "wins";
  state.games = [];
  state.scores = [];
  state.leaderboard = [];

  els.passcodeInput.value = "";
  els.teamSearch.value = "";
  els.teamSelect.innerHTML = '<option value="">All teams</option>';
  setActiveTab("games");
  els.portalSection.classList.add("hidden");
  els.loginSection.classList.remove("hidden");
}
