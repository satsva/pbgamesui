const config = window.APP_CONFIG;
const PORTAL_ACCESS_LOG_TABLE = "portal_access_log";

const state = {
  leagueValue: null,
  leagueName: "",
  passcode: "",
  selectedTeam: "",
  teamSearch: "",
  activeTab: "games",
  detailMetric: "wins",
  pendingRowsById: {},
  pendingRowId: "",
  pendingDraft: null,
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
  refreshGamesBtn: document.getElementById("refreshGamesBtn"),
  gamesAccordion: document.getElementById("gamesAccordion"),
  leaderboardTable: document.getElementById("leaderboardTable"),
  leaderboardDetailTable: document.getElementById("leaderboardDetailTable"),
  detailMetricRadios: document.querySelectorAll('input[name="detailMetric"]'),
  submitModal: document.getElementById("submitModal"),
  closeSubmitModal: document.getElementById("closeSubmitModal"),
  submitStepForm: document.getElementById("submitStepForm"),
  submitStepConfirm: document.getElementById("submitStepConfirm"),
  pendingSubmitForm: document.getElementById("pendingSubmitForm"),
  submitMatchup: document.getElementById("submitMatchup"),
  submitTeamA: document.getElementById("submitTeamA"),
  submitTeamB: document.getElementById("submitTeamB"),
  submitGameInputs: document.querySelectorAll(".game-score-input"),
  submitScoresHint: document.getElementById("submitScoresHint"),
  submitWinningTeam: document.getElementById("submitWinningTeam"),
  submitDate: document.getElementById("submitDate"),
  submitEmail: document.getElementById("submitEmail"),
  submitComments: document.getElementById("submitComments"),
  toConfirmBtn: document.getElementById("toConfirmBtn"),
  backToEditBtn: document.getElementById("backToEditBtn"),
  confirmSubmitBtn: document.getElementById("confirmSubmitBtn"),
  submitConfirmSummary: document.getElementById("submitConfirmSummary"),
  submitFormError: document.getElementById("submitFormError"),
  submitModalError: document.getElementById("submitModalError")
};

if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
  showLoginError("Configure site/config.js with Supabase URL and anon key.");
} else {
  wireEvents();
}

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

  if (els.tabGames) {
    els.tabGames.addEventListener("click", () => setActiveTab("games"));
  }
  if (els.tabLeaderboard) {
    els.tabLeaderboard.addEventListener("click", () => setActiveTab("leaderboard"));
  }

  els.detailMetricRadios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      state.detailMetric = event.target.value;
      renderLeaderboardDetail();
    });
  });

  if (els.gamesAccordion) {
    els.gamesAccordion.addEventListener("click", onGamesAccordionClick);
  }
  if (els.refreshGamesBtn) {
    els.refreshGamesBtn.addEventListener("click", () => {
      loadLeagueData().catch((error) => {
        showPortalError(error?.message || "Could not refresh games.");
      });
    });
  }
  if (els.closeSubmitModal) {
    els.closeSubmitModal.addEventListener("click", closeSubmitModal);
  }
  if (els.toConfirmBtn) {
    els.toConfirmBtn.addEventListener("click", goToConfirmStep);
  }
  if (els.submitGameInputs && els.submitGameInputs.length) {
    els.submitGameInputs.forEach((input) => {
      input.addEventListener("input", onScoreInputChanged);
      input.addEventListener("blur", onScoreInputChanged);
    });
  }
  if (els.backToEditBtn) {
    els.backToEditBtn.addEventListener("click", () => setSubmitStep("form"));
  }
  if (els.confirmSubmitBtn) {
    els.confirmSubmitBtn.addEventListener("click", onSubmitPendingResult);
  }
  if (els.submitModal) {
    els.submitModal.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "true") {
        closeSubmitModal();
      }
    });
  }
}

async function onPasscodeSubmit(event) {
  event.preventDefault();
  hideLoginError();
  hidePortalError();

  showLoginError("Checking passcode...");

  const rawPasscode = els.passcodeInput.value.trim();
  if (!rawPasscode) {
    showLoginError("Enter a valid passcode.");
    return;
  }

  try {
    const passcodes = config.views.passcodes;
    const { data, error } = await restSelect(passcodes.name, {
      filters: [{ column: passcodes.passcodeColumn, value: rawPasscode }],
      maybeSingle: true
    });

    if (error) {
      showLoginError(`Login failed: ${error.message}`);
      return;
    }

    if (!data) {
      showLoginError("Invalid passcode.");
      return;
    }

    state.leagueValue = data[passcodes.leagueColumn];
    state.leagueName = data[passcodes.leagueNameColumn] || String(state.leagueValue);
    state.passcode = rawPasscode;

    els.loginSection.classList.add("hidden");
    els.portalSection.classList.remove("hidden");
    els.leagueTitle.textContent = state.leagueName;
    els.leagueSubtitle.textContent = `League key: ${state.leagueValue}`;

    // Fire-and-forget access logging; portal entry should not block on telemetry.
    logPortalAccess().catch(() => {});

    await loadLeagueData();
  } catch (error) {
    showLoginError(`Login failed: ${error?.message || "Unexpected error"}`);
  }
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
    const filters = [];

    if (leagueColumn) {
      filters.push({ column: leagueColumn, value: state.leagueValue });
    }

    if (viewConfig.plannedColumn !== undefined) {
      filters.push({ column: viewConfig.plannedColumn, value: viewConfig.plannedValue ?? false });
    }

    return restSelect(viewConfig.name, { filters });
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
  state.pendingRowsById = {};
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

  const roundNames = [...byRound.keys()].sort(compareRoundLabelDesc);
  els.gamesAccordion.innerHTML = roundNames
    .map((roundName, idx) => {
      const roundRows = byRound.get(roundName) || [];
      const matchRows = roundRows.map((row, rowIndex) => {
          const teamAName = String(row.team_a || row[view.homeTeamColumn] || "-");
          const teamBName = String(row.team_b || row[view.awayTeamColumn] || "-");
          const winner = String(row.winner || "").trim().toLowerCase();
          const teamA = appendWinnerCup(teamAName, winner === teamAName.trim().toLowerCase());
          const teamB = appendWinnerCup(teamBName, winner === teamBName.trim().toLowerCase());
          const scoresRaw = String(row.scores || "").trim();
          const winnerRaw = String(row.winner || "").trim();
          const scoresNormalized = scoresRaw.toLowerCase();
          const isPending =
            !scoresRaw ||
            !winnerRaw ||
            scoresNormalized === "-" ||
            scoresNormalized === "tbd" ||
            scoresNormalized.includes("pending");
          const scores = scoresRaw || "Pending";
          const comments = String(row.comments || "").trim();
          const commentText = comments ? escapeHtml(comments) : "-";

          const rowId = createPendingRowId(roundName, row, rowIndex);
          state.pendingRowsById[rowId] = row;
          const scoreCell = isPending
            ? `<button type="button" class="pending-submit-btn" data-row-id="${escapeHtml(rowId)}">Submit Scores</button>`
            : escapeHtml(scores);

          return {
            teamA,
            teamB,
            scoreCell,
            commentText
          };
        });

      const tableRows = matchRows
        .map((row) => {

          return `<tr>
            <td>${row.teamA}</td>
            <td>${row.teamB}</td>
            <td>${row.scoreCell}</td>
            <td>${row.commentText}</td>
          </tr>`;
        })
        .join("");

      const cardRows = matchRows
        .map((row) => {
          return `<article class="game-card">
            <div class="game-card-match">${row.teamA} <span>vs</span> ${row.teamB}</div>
            <div class="game-card-meta"><strong>Score</strong><div>${row.scoreCell}</div></div>
            <div class="game-card-meta"><strong>Comment</strong><div>${row.commentText}</div></div>
          </article>`;
        })
        .join("");

      return `<details class="round-group" ${idx === 0 ? "open" : ""}>
        <summary>${escapeHtml(roundName)}</summary>
        <div class="round-content games-table-wrap table-wrap">
              <table class="data-table games-table">
            <thead>
              <tr>
                      <th>Team A</th>
                      <th>Team B</th>
                      <th>Score</th>
                      <th>Comment</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
        <div class="round-content games-cards">${cardRows}</div>
      </details>`;
    })
    .join("");
}

function appendWinnerCup(teamName, isWinner) {
  const safeTeam = escapeHtml(teamName);
  return isWinner ? `${safeTeam}<span class="winner-tag">&#127942;</span>` : safeTeam;
}

function createPendingRowId(roundName, row, index) {
  const core = [roundName, row.team_a, row.team_b, row.date, index]
    .map((v) => String(v || "").trim())
    .join("|");
  return core;
}

function onGamesAccordionClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest(".pending-submit-btn");
  if (!button) return;

  const rowId = button.dataset.rowId || "";
  const row = state.pendingRowsById[rowId];
  if (!row) return;
  openSubmitModal(rowId, row);
}

function openSubmitModal(rowId, row) {
  state.pendingRowId = rowId;
  state.pendingDraft = null;
  if (els.submitFormError) {
    els.submitFormError.textContent = "";
  }
  els.submitModalError.textContent = "";
  els.pendingSubmitForm.reset();

  const teamA = String(row.team_a || "").trim();
  const teamB = String(row.team_b || "").trim();
  els.submitTeamA.value = teamA;
  els.submitTeamB.value = teamB;
  if (els.submitMatchup) {
    els.submitMatchup.textContent = `${teamA} vs ${teamB}`;
  }
  els.submitDate.value = todayISO();
  if (els.submitScoresHint) {
    els.submitScoresHint.textContent = "Enter each game as 11-3 or 11/3. First 3 games are required.";
  }
  els.submitWinningTeam.innerHTML =
    '<option value="">Select winner</option>' +
    `<option value="${escapeHtmlAttr(teamA)}">${escapeHtml(teamA)}</option>` +
    `<option value="${escapeHtmlAttr(teamB)}">${escapeHtml(teamB)}</option>`;

  const existingGames = String(row.scores || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5);
  els.submitGameInputs.forEach((input, index) => {
    input.value = existingGames[index] ? existingGames[index].replace(/[/:]/g, "-") : "";
  });
  onScoreInputChanged();

  setSubmitStep("form");
  els.submitModal.classList.remove("hidden");
  els.submitModal.setAttribute("aria-hidden", "false");
}

function closeSubmitModal() {
  els.submitModal.classList.add("hidden");
  els.submitModal.setAttribute("aria-hidden", "true");
  state.pendingRowId = "";
  state.pendingDraft = null;
  if (els.submitFormError) {
    els.submitFormError.textContent = "";
  }
  els.submitModalError.textContent = "";
}

function setSubmitStep(step) {
  const confirm = step === "confirm";
  els.submitStepForm.classList.toggle("hidden", confirm);
  els.submitStepConfirm.classList.toggle("hidden", !confirm);
}

function goToConfirmStep() {
  if (els.submitFormError) {
    els.submitFormError.textContent = "";
  }
  els.submitModalError.textContent = "";
  if (!els.pendingSubmitForm.reportValidity()) {
    return;
  }

  const row = state.pendingRowsById[state.pendingRowId];
  if (!row) {
    if (els.submitFormError) {
      els.submitFormError.textContent = "The selected match could not be found.";
    }
    return;
  }

  const parsedScores = parseScoreInputs();
  if (!parsedScores.ok) {
    if (els.submitFormError) {
      els.submitFormError.textContent = parsedScores.message;
    }
    return;
  }

  const derivedWinner = deriveWinnerFromScores(parsedScores.games);
  if (!derivedWinner) {
    if (els.submitFormError) {
      els.submitFormError.textContent = "Scores must show a winner with 3 game wins (best of 5).";
    }
    return;
  }

  const selectedWinner = els.submitWinningTeam.value.trim();
  if (!selectedWinner) {
    if (els.submitFormError) {
      els.submitFormError.textContent = "Select the winning team.";
    }
    return;
  }

  if (selectedWinner !== derivedWinner) {
    if (els.submitFormError) {
      els.submitFormError.textContent = `Please double-check: scores indicate ${derivedWinner} as winner, but you selected ${selectedWinner}.`;
    }
    return;
  }

  const winningTeam = derivedWinner;

  const draft = {
    passcode: state.passcode,
    teamA: els.submitTeamA.value.trim(),
    teamB: els.submitTeamB.value.trim(),
    scores: parsedScores.normalized,
    winningTeam,
    date: els.submitDate.value,
    email: els.submitEmail.value.trim(),
    comments: els.submitComments.value.trim(),
    round: String(row.round || "").trim(),
    formid: state.leagueValue,
    formname: row.league || state.leagueName || "",
    submittedat: formatSubmittedAtUtc(),
    responseid: "GHForm"
  };

  state.pendingDraft = draft;
  renderSubmitConfirmation(draft);
  setSubmitStep("confirm");
}

function renderSubmitConfirmation(draft) {
  els.submitConfirmSummary.innerHTML = `
    <div class="confirm-grid">
      <div>Team A</div><div>${escapeHtml(draft.teamA)}</div>
      <div>Team B</div><div>${escapeHtml(draft.teamB)}</div>
      <div>Scores</div><div>${escapeHtml(draft.scores)}</div>
      <div>Winning Team</div><div>${escapeHtml(draft.winningTeam)}</div>
      <div>Date</div><div>${escapeHtml(draft.date)}</div>
      <div>Your Email</div><div>${escapeHtml(draft.email)}</div>
      <div>Round</div><div>${escapeHtml(draft.round || "-")}</div>
      <div>Comments</div><div>${escapeHtml(draft.comments || "-")}</div>
    </div>
  `;
}

function onScoreInputChanged() {
  const parsed = parseScoreInputs({ allowEmpty: true });
  if (els.submitScoresHint) {
    els.submitScoresHint.textContent = parsed.ok
      ? "Enter each game as 11-3 or 11/3. First 3 games are required."
      : parsed.message;
  }

  if (!parsed.ok || !parsed.games.length) {
    els.submitWinningTeam.value = "";
    return;
  }

  const autoWinner = deriveWinnerFromScores(parsed.games);
  if (autoWinner) {
    els.submitWinningTeam.value = autoWinner;
  } else {
    els.submitWinningTeam.value = "";
  }
}

function parseScoreInputs({ allowEmpty = false } = {}) {
  const games = [];
  const inputs = Array.from(els.submitGameInputs || []);
  const requiredInputCount = Math.min(3, inputs.length);
  let seenScore = false;
  let seenGap = false;

  for (let i = 0; i < inputs.length; i += 1) {
    const raw = String(inputs[i].value || "").trim();

    if (raw) {
      seenScore = true;
      if (seenGap) {
        return {
          ok: false,
          message: `Fill game scores in order. Game ${i + 1} cannot be entered before earlier empty games.`
        };
      }
    } else if (seenScore) {
      seenGap = true;
    }

    if (!raw) {
      continue;
    }

    const normalizedRaw = raw.replace(/[/:]/g, "-").replace(/\s+/g, "");
    const match = normalizedRaw.match(/^(\d{1,2})-(\d{1,2})$/);
    if (!match) {
      return {
        ok: false,
        message: `Game ${i + 1} must look like 11-3 or 11/3.`
      };
    }

    const a = Number(match[1]);
    const b = Number(match[2]);
    if (Number.isNaN(a) || Number.isNaN(b) || a < 0 || b < 0) {
      return {
        ok: false,
        message: `Game ${i + 1} has an invalid score.`
      };
    }

    if (a === b) {
      return {
        ok: false,
        message: `Game ${i + 1} cannot end in a tie.`
      };
    }

    games.push({ a, b, normalized: `${a}-${b}` });
  }

  if (!games.length && !allowEmpty) {
    return {
      ok: false,
      message: "Enter scores for at least 3 games."
    };
  }

  if (!allowEmpty && games.length < requiredInputCount) {
    return {
      ok: false,
      message: "Enter scores for at least the first 3 games."
    };
  }

  return {
    ok: true,
    games,
    normalized: games.map((g) => g.normalized).join(",")
  };
}

function deriveWinnerFromScores(games) {
  let teamAWins = 0;
  let teamBWins = 0;

  games.forEach((game) => {
    if (game.a > game.b) {
      teamAWins += 1;
    } else if (game.b > game.a) {
      teamBWins += 1;
    }
  });

  if (teamAWins === 3 && teamBWins <= 2) {
    return els.submitTeamA.value.trim();
  }

  if (teamBWins === 3 && teamAWins <= 2) {
    return els.submitTeamB.value.trim();
  }

  return "";
}

async function onSubmitPendingResult() {
  const draft = state.pendingDraft;
  const sourceRow = state.pendingRowsById[state.pendingRowId] || null;
  if (!draft) {
    els.submitModalError.textContent = "No pending submission found.";
    return;
  }

  els.submitModalError.textContent = "";
  els.confirmSubmitBtn.disabled = true;
  els.confirmSubmitBtn.textContent = "Submitting...";

  const ipDetails = await collectSubmissionClientDetails();

  const payload = {
    id: generateUuid(),
    passcode: draft.passcode,
    "Team A": draft.teamA,
    "Team B": draft.teamB,
    scores: draft.scores,
    "Winning Team": draft.winningTeam,
    date: draft.date,
    "Your Email": draft.email,
    comments: draft.comments || null,
    round: draft.round || null,
    formid: String(draft.formid || ""),
    formname: draft.formname,
    is_planned: false,
    responseid: "GHForm",
    submittedat: draft.submittedat,
    ipdetails: JSON.stringify(ipDetails)
  };

  const insertResult = await restInsert("matches_staging", payload);
  const error = insertResult.error;

  if (error) {
    els.submitModalError.textContent = `Submission failed: ${error.message}`;
    els.confirmSubmitBtn.disabled = false;
    els.confirmSubmitBtn.textContent = "Submit";
    return;
  }

  applySubmittedResultToGames(sourceRow, draft);
  closeSubmitModal();
  renderAll();

  // Refresh from backend shortly after submit in case source views update asynchronously.
  setTimeout(() => {
    loadLeagueData().catch(() => {});
  }, 1200);
}

async function collectSubmissionClientDetails() {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  const details = {
    submittedAtUtc: now.toISOString(),
    submittedAtLocal: now.toString(),
    timezone,
    userAgent: navigator.userAgent || "unknown",
    language: navigator.language || "unknown",
    platform: navigator.platform || "unknown",
    referrer: document.referrer || "",
    page: window.location.href,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    ip: null,
    ipSource: null
  };

  const ipServices = [
    { name: "ipify", url: "https://api64.ipify.org?format=json" },
    { name: "ipapi", url: "https://ipapi.co/json/" }
  ];

  for (const service of ipServices) {
    try {
      const response = await fetch(service.url, { cache: "no-store" });
      if (!response.ok) continue;
      const body = await response.json();
      const ip = String(body.ip || "").trim();
      if (!ip) continue;
      details.ip = ip;
      details.ipSource = service.name;
      break;
    } catch {
      // Continue to the next lookup provider.
    }
  }

  return details;
}

function applySubmittedResultToGames(sourceRow, draft) {
  if (!sourceRow) return;

  const targetTeamA = String(sourceRow.team_a || "").trim().toLowerCase();
  const targetTeamB = String(sourceRow.team_b || "").trim().toLowerCase();
  const targetRound = String(sourceRow.round || "").trim().toLowerCase();

  state.games = state.games.map((row) => {
    const teamA = String(row.team_a || "").trim().toLowerCase();
    const teamB = String(row.team_b || "").trim().toLowerCase();
    const round = String(row.round || "").trim().toLowerCase();

    if (teamA === targetTeamA && teamB === targetTeamB && round === targetRound) {
      return {
        ...row,
        scores: draft.scores,
        winner: draft.winningTeam,
        comments: draft.comments || row.comments,
        date: draft.date || row.date
      };
    }
    return row;
  });
}

function todayISO() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

function formatSubmittedAtUtc() {
  const now = new Date();
  const utcNoMillis = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    0
  ));
  return utcNoMillis.toISOString();
}

async function restSelect(table, { filters = [], maybeSingle = false } = {}) {
  try {
    const url = new URL(`${config.supabaseUrl}/rest/v1/${encodeURIComponent(table)}`);
    url.searchParams.set("select", "*");

    filters.forEach((filter) => {
      const value = formatFilterValue(filter.value);
      url.searchParams.set(filter.column, `eq.${value}`);
    });

    const headers = {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`
    };

    if (maybeSingle) {
      headers.Accept = "application/vnd.pgrst.object+json";
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const body = await safeJson(response);
      if (maybeSingle && response.status === 406) {
        return { data: null, error: null };
      }
      return {
        data: null,
        error: { message: body?.message || `HTTP ${response.status}` }
      };
    }

    const data = await safeJson(response);
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error?.message || "Network request failed" }
    };
  }
}

async function restInsert(table, row) {
  const url = `${config.supabaseUrl}/rest/v1/${encodeURIComponent(table)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    const body = await safeJson(response);
    return { error: { message: body?.message || `HTTP ${response.status}` } };
  }

  return { error: null };
}

function formatFilterValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function generateUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function renderLeaderboard() {
  const view = config.views.leaderboard;
  const scoreView = config.views.scores;
  const sortedRows = [...state.leaderboard]
    .sort((a, b) => {
      const winsDiff = Number(b[view.winsColumn] ?? 0) - Number(a[view.winsColumn] ?? 0);
      if (winsDiff !== 0) return winsDiff;
      const pointsDiff = Number(b[view.pointsColumn] ?? 0) - Number(a[view.pointsColumn] ?? 0);
      if (pointsDiff !== 0) return pointsDiff;
      return String(a[view.teamColumn] || "").localeCompare(String(b[view.teamColumn] || ""));
    });
  const rankByTeam = new Map(
    sortedRows.map((row, index) => [String(row[view.teamColumn] || "").trim(), index + 1])
  );
  const rows = sortedRows.filter((row) => teamMatch([row[view.teamColumn]]));

  const gamesPlayedByTeam = new Map();
  const detailRowsByTeam = new Map();
  state.scores.forEach((row) => {
    const team = String(row[scoreView.teamColumn] || "").trim();
    if (!team) return;

    if (!teamMatch([team, row[scoreView.opponentColumn]])) {
      return;
    }

    gamesPlayedByTeam.set(team, Number(gamesPlayedByTeam.get(team) || 0) + 1);

    if (!detailRowsByTeam.has(team)) {
      detailRowsByTeam.set(team, []);
    }
    const winValue = Number(row[scoreView.winsColumn] ?? row[scoreView.winnerFlagColumn] ?? 0);
    const isTeamWinner = winValue > 0;
    const opponent = String(row[scoreView.opponentColumn] || "-").trim();
    const opponentWithIcon = !isTeamWinner && opponent !== "-"
      ? `${escapeHtml(opponent)} <span class="winner-inline-icon" aria-label="Winner">&#127942;</span>`
      : escapeHtml(opponent);

    detailRowsByTeam.get(team).push({
      round: String(row[scoreView.roundColumn] || "Round").trim(),
      opponent,
      opponentHtml: opponentWithIcon,
      points: Number(row[scoreView.pointsColumn] ?? 0)
    });
  });

  detailRowsByTeam.forEach((entries) => {
    entries.sort((a, b) => compareRoundLabel(a.round, b.round));
  });

  const orderedTeams = rows.map((row) => String(row[view.teamColumn] || ""));
  const rankChart = renderCumulativePointsChart(orderedTeams);
  const ribbonChart = renderCumulativeRibbonChart(orderedTeams);

  els.leaderboardTable.innerHTML = rows.length
      ? `<div class="leaderboard-cards">
          ${rows
            .map((row, index) => {
              const team = String(row[view.teamColumn] || "Team");
              const rank = Number(rankByTeam.get(team) || index + 1);
              const wins = Number(row[view.winsColumn] ?? 0);
              const gamesPlayed = Number(gamesPlayedByTeam.get(team) || 0);
              const points = Number(row[view.pointsColumn] ?? 0);
              const pointsClass = points > 0 ? "points-positive" : points < 0 ? "points-negative" : "";
              const detailRows = detailRowsByTeam.get(team) || [];
              const detailMarkup = detailRows.length
                ? `<details class="leaderboard-expand">
                    <summary>Round Details</summary>
                    <div class="leaderboard-expand-body">
                      ${detailRows
                        .map((entry) => {
                          const pointClass = entry.points > 0 ? "points-positive" : "points-negative";
                          return `<div class="leaderboard-round-row">
                            <span>${escapeHtml(entry.round)}</span>
                            <span>${entry.opponentHtml || escapeHtml(entry.opponent || "-")}</span>
                            <span class="${pointClass}">${escapeHtml(formatNumber(entry.points, "points"))}</span>
                          </div>`;
                        })
                        .join("")}
                    </div>
                  </details>`
                : "<p class=\"muted\">No round details available.</p>";

              return `<article class="leaderboard-card">
                <div class="leaderboard-card-head">
                  <span class="leaderboard-rank">#${escapeHtml(String(rank))}</span>
                  <strong>${escapeHtml(team)}</strong>
                </div>
                <div class="leaderboard-card-metrics">
                  <span><strong>Wins:</strong> ${escapeHtml(String(wins))} of ${escapeHtml(String(gamesPlayed))}</span>
                  <span><strong>Points:</strong> <span class="${pointsClass}">${escapeHtml(formatNumber(points, "points"))}</span></span>
                </div>
                ${detailMarkup}
              </article>`;
            })
            .join("")}
        </div>
        ${rankChart}
        ${ribbonChart}`
    : "<p class=\"muted\">No leaderboard data for this filter.</p>";
}

function renderCumulativePointsChart(orderedTeams) {
  const scoreView = config.views.scores;
  const filtered = state.scores.filter((row) =>
    teamMatch([row[scoreView.teamColumn], row[scoreView.opponentColumn]])
  );

  const roundSet = new Set();
  filtered.forEach((row) => {
    const round = String(row[scoreView.roundColumn] || "Round").trim();
    roundSet.add(round);
  });

  const rounds = [...roundSet].sort(compareRoundLabel);
  if (!rounds.length || !orderedTeams.length) {
    return "";
  }

  const allTeams = [...state.leaderboard]
    .sort((a, b) => {
      const winsDiff = Number(b[config.views.leaderboard.winsColumn] ?? 0) - Number(a[config.views.leaderboard.winsColumn] ?? 0);
      if (winsDiff !== 0) return winsDiff;
      const pointsDiff = Number(b[config.views.leaderboard.pointsColumn] ?? 0) - Number(a[config.views.leaderboard.pointsColumn] ?? 0);
      if (pointsDiff !== 0) return pointsDiff;
      return String(a[config.views.leaderboard.teamColumn] || "").localeCompare(String(b[config.views.leaderboard.teamColumn] || ""));
    })
    .map((row) => String(row[config.views.leaderboard.teamColumn] || "").trim())
    .filter(Boolean);

  const pointsByTeamRound = new Map();
  const globalTeamSet = new Set(allTeams);
  state.scores.forEach((row) => {
    const team = String(row[scoreView.teamColumn] || "").trim();
    if (!team || !globalTeamSet.has(team)) return;

    const round = String(row[scoreView.roundColumn] || "Round").trim();
    const key = `${team}::${round}`;
    pointsByTeamRound.set(key, Number(pointsByTeamRound.get(key) || 0) + Number(row[scoreView.pointsColumn] ?? 0));
  });

  const displayedTeams = orderedTeams.filter(Boolean);
  const cumulativeByTeam = new Map(allTeams.map((team) => [team, 0]));
  const rankByTeam = new Map(allTeams.map((team) => [team, []]));

  rounds.forEach((round) => {
    allTeams.forEach((team) => {
      const key = `${team}::${round}`;
      const updated = Number(cumulativeByTeam.get(team) || 0) + Number(pointsByTeamRound.get(key) || 0);
      cumulativeByTeam.set(team, updated);
    });

    const ranked = [...allTeams].sort((teamA, teamB) => {
      const diff = Number(cumulativeByTeam.get(teamB) || 0) - Number(cumulativeByTeam.get(teamA) || 0);
      if (diff !== 0) return diff;
      return teamA.localeCompare(teamB);
    });

    ranked.forEach((team, idx) => {
      rankByTeam.get(team).push(idx + 1);
    });
  });

  const teamSeries = displayedTeams.map((team) => ({ team, values: rankByTeam.get(team) || [] }));
  const maxRank = Math.max(1, allTeams.length);

  const width = 780;
  const height = 320;
  const padLeft = 48;
  const padRight = 110;
  const padTop = 18;
  const padBottom = 44;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const stepCount = Math.max(1, rounds.length - 1);
  const preferredStep = 92;
  const compactPlotWidth = Math.min(plotWidth, Math.max(170, stepCount * preferredStep));
  const xOffset = (plotWidth - compactPlotWidth) / 2;

  const xFor = (idx) => {
    if (rounds.length <= 1) {
      return padLeft + xOffset + compactPlotWidth / 2;
    }
    return padLeft + xOffset + (idx / (rounds.length - 1)) * compactPlotWidth;
  };

  const yFor = (rank) => {
    if (maxRank <= 1) {
      return padTop + plotHeight / 2;
    }
    return padTop + ((rank - 1) / (maxRank - 1)) * plotHeight;
  };

  const linePalette = ["#0a9d75", "#ef6c00", "#1976d2", "#6a1b9a", "#2e7d32", "#c62828", "#00838f", "#5d4037"];
  const rankMarkerOffsetX = 4;
  const rankMarkerOffsetY = -4;
  const endTeamLabelOffsetX = 18;
  const endTeamLabelOffsetY = 4;

  const yTickLines = Array.from({ length: maxRank }, (_, idx) => {
    const rank = idx + 1;
    const y = yFor(rank);
    return `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" class="chart-grid" />
      <text x="${padLeft - 8}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${escapeHtml(String(rank))}</text>
    `;
  }).join("");

  const xLabels = rounds
    .map((round, idx) => {
      const x = xFor(idx);
      return `<text x="${x}" y="${height - 18}" class="chart-axis-label" text-anchor="middle">${escapeHtml(round)}</text>`;
    })
    .join("");

  const seriesLines = teamSeries
    .map((series, idx) => {
      const color = linePalette[idx % linePalette.length];
      const strokeWidth = 2;
      const points = series.values
        .map((value, valueIdx) => `${xFor(valueIdx)},${yFor(value)}`)
        .join(" ");

      const pointDots = series.values
        .map((value, valueIdx) => {
          const cx = xFor(valueIdx);
          const cy = yFor(value);
          return `<circle cx="${cx}" cy="${cy}" r="2.4" fill="${color}" />
            <text x="${cx + rankMarkerOffsetX}" y="${cy + rankMarkerOffsetY}" class="chart-point-rank">${escapeHtml(String(value))}</text>`;
        })
        .join("");

      const lastRank = series.values.at(-1);
      const endLabel = lastRank
        ? `<text x="${xFor(rounds.length - 1) + endTeamLabelOffsetX}" y="${yFor(lastRank) + endTeamLabelOffsetY}" class="chart-end-label">${escapeHtml(series.team)}</text>`
        : "";

      return `
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" />
        ${pointDots}
        ${endLabel}
      `;
    })
    .join("");

  return `
    <section class="leaderboard-chart">
      <h4>Rank Movement by Round</h4>
      <p class="muted">Lower rank is better.</p>
      <div class="chart-wrap">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Rank over round bump chart by team">
          <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" class="chart-axis" />
          <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" class="chart-axis" />
          ${yTickLines}
          ${xLabels}
          ${seriesLines}
        </svg>
      </div>
    </section>
  `;
}

function renderCumulativeRibbonChart(orderedTeams) {
  const scoreView = config.views.scores;
  const filtered = state.scores.filter((row) =>
    teamMatch([row[scoreView.teamColumn], row[scoreView.opponentColumn]])
  );

  const roundSet = new Set();
  filtered.forEach((row) => {
    const round = String(row[scoreView.roundColumn] || "Round").trim();
    roundSet.add(round);
  });

  const rounds = [...roundSet].sort(compareRoundLabel);
  if (!rounds.length || !orderedTeams.length) {
    return "";
  }

  const teamSet = new Set(orderedTeams.filter(Boolean));
  const pointsByTeamRound = new Map();
  filtered.forEach((row) => {
    const team = String(row[scoreView.teamColumn] || "").trim();
    if (!team || !teamSet.has(team)) return;

    const round = String(row[scoreView.roundColumn] || "Round").trim();
    const key = `${team}::${round}`;
    pointsByTeamRound.set(key, Number(pointsByTeamRound.get(key) || 0) + Number(row[scoreView.pointsColumn] ?? 0));
  });

  const teams = orderedTeams.filter(Boolean);
  const teamSeries = teams.map((team) => {
    let cumulative = 0;
    const values = rounds.map((round) => {
      const key = `${team}::${round}`;
      cumulative += Number(pointsByTeamRound.get(key) || 0);
      return cumulative;
    });
    return { team, values };
  });

  const allValues = teamSeries.flatMap((series) => series.values);
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(0, ...allValues);

  const width = 780;
  const height = 320;
  const padLeft = 48;
  const padRight = 120;
  const padTop = 18;
  const padBottom = 44;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const stepCount = Math.max(1, rounds.length - 1);
  const preferredStep = 92;
  const compactPlotWidth = Math.min(plotWidth, Math.max(170, stepCount * preferredStep));
  const xOffset = (plotWidth - compactPlotWidth) / 2;

  const xFor = (idx) => {
    if (rounds.length <= 1) {
      return padLeft + xOffset + compactPlotWidth / 2;
    }
    return padLeft + xOffset + (idx / (rounds.length - 1)) * compactPlotWidth;
  };

  const yFor = (value) => {
    if (maxValue === minValue) {
      return padTop + plotHeight / 2;
    }
    return padTop + ((maxValue - value) / (maxValue - minValue)) * plotHeight;
  };

  const linePalette = ["#0a9d75", "#ef6c00", "#1976d2", "#6a1b9a", "#2e7d32", "#c62828", "#00838f", "#5d4037"];

  const topTeams = [...teamSeries]
    .sort((a, b) => Number(b.values.at(-1) || 0) - Number(a.values.at(-1) || 0))
    .slice(0, 4)
    .map((series) => series.team);
  const topTeamSet = new Set(topTeams);

  const yTicks = 5;
  const yTickLines = Array.from({ length: yTicks }, (_, idx) => {
    const value = minValue + ((maxValue - minValue) * idx) / (yTicks - 1 || 1);
    const y = yFor(value);
    return `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" class="chart-grid" />
      <text x="${padLeft - 8}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${escapeHtml(formatNumber(value, "points"))}</text>
    `;
  }).join("");

  const xLabels = rounds
    .map((round, idx) => {
      const x = xFor(idx);
      return `<text x="${x}" y="${height - 18}" class="chart-axis-label" text-anchor="middle">${escapeHtml(round)}</text>`;
    })
    .join("");

  const ribbons = teamSeries
    .map((series, idx) => {
      const color = linePalette[idx % linePalette.length];
      const isTop = topTeamSet.has(series.team);
      const linePoints = series.values
        .map((value, valueIdx) => `${xFor(valueIdx)},${yFor(value)}`)
        .join(" ");
      const pointDots = series.values
        .map((value, valueIdx) => `<circle cx="${xFor(valueIdx)}" cy="${yFor(value)}" r="${isTop ? "2.6" : "1.9"}" fill="${color}" fill-opacity="${isTop ? "0.95" : "0.6"}" />`)
        .join("");

      const endValue = series.values.at(-1);
      const endLabel = typeof endValue === "number"
        ? `<text x="${xFor(rounds.length - 1) + 8}" y="${yFor(endValue) + 4}" class="chart-end-label ${isTop ? "chart-end-label-strong" : ""}">${escapeHtml(series.team)}</text>`
        : "";

      return `
        <polyline points="${linePoints}" fill="none" stroke="${color}" stroke-opacity="${isTop ? "0.9" : "0.45"}" stroke-width="${isTop ? "2.2" : "1.4"}" />
        ${pointDots}
        ${endLabel}
      `;
    })
    .join("");

  return `
    <section class="leaderboard-chart leaderboard-chart-ribbon">
      <h4>Cumulative Points Movement</h4>
      <p class="muted">Higher is better.</p>
      <div class="chart-wrap">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative points movement by round ribbon chart">
          <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" class="chart-axis" />
          <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" class="chart-axis" />
          ${yTickLines}
          ${xLabels}
          ${ribbons}
        </svg>
      </div>
    </section>
  `;
}

function renderLeaderboardDetail() {
  if (!els.leaderboardDetailTable) {
    return;
  }
  els.leaderboardDetailTable.innerHTML = "";
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

function compareRoundLabelDesc(a, b) {
  return compareRoundLabel(b, a);
}

async function logPortalAccess() {
  const details = await collectSubmissionClientDetails();
  const payload = {
    id: generateUuid(),
    event_type: "enter_portal",
    league_id: String(state.leagueValue || ""),
    league_name: state.leagueName || null,
    entered_at: formatSubmittedAtUtc(),
    ipdetails: JSON.stringify({
      ...details,
      event: "enter_portal"
    })
  };

  await restInsert(PORTAL_ACCESS_LOG_TABLE, payload);
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
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
