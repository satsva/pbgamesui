const config = window.APP_CONFIG;
const PORTAL_ACCESS_LOG_TABLE = "portal_access_log";
const CHART_LINE_PALETTE = [
  "#0a9d75",
  "#ef6c00",
  "#1976d2",
  "#6a1b9a",
  "#2e7d32",
  "#c62828",
  "#00838f",
  "#5d4037",
  "#ad1457",
  "#1565c0",
  "#9e9d24",
  "#283593"
];

const state = {
  leagueValue: null,
  leagueName: "",
  passcode: "",
  selectedTeam: "",
  highlightTeam: "",
  teamSearch: "",
  activeTab: "games",
  detailMetric: "wins",
  pendingRowsById: {},
  contactRowsByTeamId: {},
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
  submitWinnerHint: document.getElementById("submitWinnerHint"),
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
  if (els.panelLeaderboard) {
    els.panelLeaderboard.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || target.id !== "highlightTeamSelect") {
        return;
      }
      state.highlightTeam = target.value;
      renderLeaderboard();
    });

    els.panelLeaderboard.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const clickable = target.closest("[data-team-select]");
      if (!clickable) {
        return;
      }

      const team = String(clickable.getAttribute("data-team-select") || "").trim();
      if (!team) {
        return;
      }

      state.highlightTeam = state.highlightTeam === team ? "" : team;
      renderLeaderboard();
    });
  }
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
  if (els.submitWinningTeam) {
    els.submitWinningTeam.addEventListener("change", onWinnerSelectionChanged);
    els.submitWinningTeam.addEventListener("input", onWinnerSelectionChanged);
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
            ? `<div class="pending-actions">
                <button type="button" class="sms-team-btn" data-row-id="${escapeHtml(rowId)}">SMS Team</button>
                <button type="button" class="pending-submit-btn" data-row-id="${escapeHtml(rowId)}">Submit Scores</button>
              </div>`
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

async function onGamesAccordionClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const smsButton = target.closest(".sms-team-btn");
  if (smsButton) {
    const rowId = smsButton.dataset.rowId || "";
    const row = state.pendingRowsById[rowId];
    if (!row) return;
    await onSmsTeamClick(row);
    return;
  }

  const button = target.closest(".pending-submit-btn");
  if (!button) return;

  const rowId = button.dataset.rowId || "";
  const row = state.pendingRowsById[rowId];
  if (!row) return;
  openSubmitModal(rowId, row);
}

async function onSmsTeamClick(row) {
  const teamA = String(row.team_a || "").trim();
  const teamB = String(row.team_b || "").trim();

  if (!teamA || !teamB) {
    window.alert("Could not determine the teams for this match.");
    return;
  }

  try {
    const contactRow = await fetchContactRowForMatchup(teamA, teamB);
    if (!contactRow) {
      window.alert(`No SMS contact details were found for ${teamA} vs ${teamB}.`);
      return;
    }

    const view = config.views.contact || {};
    const phonesColumn = view.phonesColumn || "phones";
    const playerPhonesColumn = view.playerPhonesColumn || "player_phones";

    const phones = parsePhoneList(contactRow[phonesColumn]);
    if (!phones.length) {
      window.alert(`No phone numbers were found for ${teamA} vs ${teamB}.`);
      return;
    }

    const playerDetails = String(contactRow[playerPhonesColumn] || "").trim();
    const defaultMessage = buildSmsTeamMessage({
      teamA,
      teamB,
      phones,
      playerDetails
    });
    openSmsComposer(phones, defaultMessage);
  } catch (error) {
    window.alert(`Could not open SMS app: ${error?.message || "unexpected error"}`);
  }
}

async function fetchContactRowForMatchup(teamA, teamB) {
  const view = config.views.contact || {};
  const viewName = String(view.name || "").trim();
  if (!viewName) {
    throw new Error("Contact view is not configured. Add views.contact in site/config.js.");
  }

  const teamIdColumn = view.teamIdColumn || "team_id";
  const forwardTeamId = `${teamA} vs ${teamB}`;
  const reverseTeamId = `${teamB} vs ${teamA}`;

  const cachedForward = state.contactRowsByTeamId[forwardTeamId];
  if (cachedForward) {
    return cachedForward;
  }

  const cachedReverse = state.contactRowsByTeamId[reverseTeamId];
  if (cachedReverse) {
    return cachedReverse;
  }

  const [forward, reverse] = await Promise.all([
    restSelect(viewName, { filters: [{ column: teamIdColumn, value: forwardTeamId }] }),
    restSelect(viewName, { filters: [{ column: teamIdColumn, value: reverseTeamId }] })
  ]);

  const directRow = (forward.data && forward.data[0]) || (reverse.data && reverse.data[0]) || null;
  if (directRow) {
    const key = String(directRow[teamIdColumn] || "").trim();
    if (key) {
      state.contactRowsByTeamId[key] = directRow;
    }
    return directRow;
  }

  // Fallback: if exact eq lookup misses due spacing/format differences, normalize all rows once.
  const allContacts = await restSelect(viewName);
  if (allContacts.error) {
    throw new Error(allContacts.error.message || "Failed to load contact view.");
  }

  const targetForward = normalizeMatchupId(forwardTeamId);
  const targetReverse = normalizeMatchupId(reverseTeamId);
  const matched = (allContacts.data || []).find((contactRow) => {
    const id = normalizeMatchupId(contactRow[teamIdColumn]);
    return id === targetForward || id === targetReverse;
  }) || null;

  if (matched) {
    const key = String(matched[teamIdColumn] || "").trim();
    if (key) {
      state.contactRowsByTeamId[key] = matched;
    }
  }

  return matched;
}

function normalizeMatchupId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bvs\.\b/g, "vs")
    .replace(/\bv\b/g, "vs");
}

function parsePhoneList(rawPhones) {
  return String(rawPhones || "")
    .split(",")
    .map((phone) => sanitizePhoneNumber(phone))
    .filter(Boolean);
}

function sanitizePhoneNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const hasPlusPrefix = raw.startsWith("+");
  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) {
    return "";
  }

  return hasPlusPrefix ? `+${digitsOnly}` : digitsOnly;
}

function buildSmsTeamMessage({ teamA, teamB, phones, playerDetails }) {
  const suffixQueue = (phones || [])
    .map((phone) => getPhoneSuffix(phone))
    .filter(Boolean);

  const parsedPlayerPhones = parsePlayerPhoneDetails(playerDetails);
  const teamAText = formatTeamWithPhoneSuffixes(teamA, parsedPlayerPhones, suffixQueue);
  const teamBText = formatTeamWithPhoneSuffixes(teamB, parsedPlayerPhones, suffixQueue);

  return `Hi Team, we are playing this week for M&M Men's League Apr 2026. Team is ${teamAText} vs ${teamBText}`;
}

function formatTeamWithPhoneSuffixes(teamLabel, playerPhoneLookup, suffixQueue) {
  const players = String(teamLabel || "")
    .split(/\s*&\s*/)
    .map((name) => name.trim())
    .filter(Boolean);

  if (!players.length) {
    return String(teamLabel || "").trim();
  }

  const decoratedPlayers = players.map((name) => {
    const lookupKey = normalizePlayerName(name);
    const mappedSuffixes = playerPhoneLookup.get(lookupKey) || [];
    const mappedSuffix = mappedSuffixes.length ? mappedSuffixes.shift() : "";
    const suffix = mappedSuffix || suffixQueue.shift() || "";

    return suffix ? `${name} (${suffix})` : name;
  });

  return decoratedPlayers.join(" & ");
}

function parsePlayerPhoneDetails(rawDetails) {
  const lookup = new Map();
  const details = String(rawDetails || "").trim();
  if (!details) {
    return lookup;
  }

  const tokens = details
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  tokens.forEach((token) => {
    const pair = parsePlayerPhoneToken(token);
    if (!pair) {
      return;
    }

    const nameKey = normalizePlayerName(pair.name);
    const suffix = getPhoneSuffix(pair.phone);
    if (!nameKey || !suffix) {
      return;
    }

    const existing = lookup.get(nameKey) || [];
    existing.push(suffix);
    lookup.set(nameKey, existing);
  });

  return lookup;
}

function parsePlayerPhoneToken(token) {
  const namedWithParens = token.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (namedWithParens) {
    return {
      name: namedWithParens[1].trim(),
      phone: namedWithParens[2].trim()
    };
  }

  const namedWithDelimiter = token.match(/^(.+?)\s*[:=-]\s*(.+)$/);
  if (namedWithDelimiter) {
    return {
      name: namedWithDelimiter[1].trim(),
      phone: namedWithDelimiter[2].trim()
    };
  }

  return null;
}

function normalizePlayerName(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function getPhoneSuffix(phoneValue) {
  const digits = String(phoneValue || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  return digits.length > 4 ? digits.slice(-4) : digits;
}

function openSmsComposer(phoneNumbers, message) {
  const uniqueNumbers = [...new Set(phoneNumbers.filter(Boolean))];
  const recipients = uniqueNumbers.join(",");
  const body = encodeURIComponent(String(message || ""));
  const isIos = isIosDevice();

  // iOS 15+ can ignore additional recipients in the classic sms:<numbers>?body=... format.
  // Use addresses query first, then quickly fall back to the classic URL if needed.
  const primaryUrl = isIos
    ? `sms:open?addresses=${encodeURIComponent(recipients)}${body ? `&body=${body}` : ""}`
    : body
      ? `sms:${recipients}?body=${body}`
      : `sms:${recipients}`;

  if (!isIos) {
    window.location.href = primaryUrl;
    return;
  }

  window.location.href = primaryUrl;

  const fallbackUrl = body ? `sms:${recipients}?body=${body}` : `sms:${recipients}`;
  setTimeout(() => {
    if (!document.hidden) {
      window.location.href = fallbackUrl;
    }
  }, 350);
}

function isIosDevice() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function openSubmitModal(rowId, row) {
  state.pendingRowId = rowId;
  state.pendingDraft = null;
  if (els.submitFormError) {
    els.submitFormError.textContent = "";
  }
  clearWinnerValidationState();
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
  clearWinnerValidationState();
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
  clearWinnerValidationState();
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

  const winnerValidation = validateWinnerSelection({
    parsedScores,
    derivedWinner,
    showRequired: true
  });
  if (!winnerValidation.ok) {
    return;
  }

  const winningTeam = winnerValidation.selectedWinner;

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
      <div>Team A</div><div><strong>${escapeHtml(draft.teamA)}</strong></div>
      <div>Team B</div><div><strong>${escapeHtml(draft.teamB)}</strong></div>
      <div>Scores</div><div><strong>${escapeHtml(draft.scores)}</strong></div>
      <div>Winning Team</div><div><strong>${escapeHtml(draft.winningTeam)}</strong></div>
      <div>Date</div><div><strong>${escapeHtml(draft.date)}</strong></div>
      <div>Your Email</div><div><strong>${escapeHtml(draft.email)}</strong></div>
      <div>Round</div><div><strong>${escapeHtml(draft.round || "-")}</strong></div>
      <div>Comments</div><div><strong>${escapeHtml(draft.comments || "-")}</strong></div>
    </div>
  `;
}

function onScoreInputChanged() {
  const parsed = parseScoreInputs({ allowEmpty: true });
  applyScoreInputValidationState(parsed);
  if (els.submitScoresHint) {
    els.submitScoresHint.textContent = parsed.ok
      ? "Enter each game as 11-3 or 11/3. First 3 games are required."
      : parsed.message;
  }

  if (!parsed.ok || !parsed.games.length) {
    els.submitWinningTeam.value = "";
    clearWinnerValidationState();
    return;
  }

  const autoWinner = deriveWinnerFromScores(parsed.games);
  if (autoWinner) {
    els.submitWinningTeam.value = autoWinner;
  } else {
    els.submitWinningTeam.value = "";
  }

  validateWinnerSelection({ parsedScores: parsed, derivedWinner: autoWinner });
}

function onWinnerSelectionChanged() {
  validateWinnerSelection();
}

function clearWinnerValidationState() {
  if (els.submitWinnerHint) {
    els.submitWinnerHint.textContent = "";
  }
  if (els.submitWinningTeam) {
    els.submitWinningTeam.classList.remove("invalid-winner");
  }
}

function setWinnerValidationError(message) {
  if (els.submitWinnerHint) {
    els.submitWinnerHint.textContent = message;
  }
  if (els.submitWinningTeam) {
    els.submitWinningTeam.classList.add("invalid-winner");
  }
}

function validateWinnerSelection({ parsedScores = null, derivedWinner = "", showRequired = false } = {}) {
  clearWinnerValidationState();

  const selectedWinner = String(els.submitWinningTeam?.value || "").trim();
  if (!selectedWinner) {
    if (showRequired) {
      setWinnerValidationError("Select the winning team.");
      return { ok: false, selectedWinner: "" };
    }
    return { ok: true, selectedWinner: "" };
  }

  const parsed = parsedScores || parseScoreInputs({ allowEmpty: true });
  if (!parsed.ok || !parsed.games.length) {
    return { ok: true, selectedWinner };
  }

  const winnerFromScores = derivedWinner || deriveWinnerFromScores(parsed.games);
  if (!winnerFromScores) {
    return { ok: true, selectedWinner };
  }

  if (selectedWinner !== winnerFromScores) {
    setWinnerValidationError(`Please double-check: scores indicate ${winnerFromScores} as winner, but you selected ${selectedWinner}.`);
    return { ok: false, selectedWinner, derivedWinner: winnerFromScores };
  }

  return { ok: true, selectedWinner, derivedWinner: winnerFromScores };
}

function applyScoreInputValidationState(parsed) {
  const inputs = Array.from(els.submitGameInputs || []);
  inputs.forEach((input, index) => {
    const row = input.closest(".score-row");
    if (!row) {
      return;
    }

    const isInvalid = !parsed.ok && typeof parsed.invalidIndex === "number" && parsed.invalidIndex === index;
    row.classList.toggle("invalid-score", isInvalid);
  });
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
          invalidIndex: i,
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
        invalidIndex: i,
        message: `Game ${i + 1} must look like 11-3 or 11/3.`
      };
    }

    const a = Number(match[1]);
    const b = Number(match[2]);
    if (Number.isNaN(a) || Number.isNaN(b) || a < 0 || b < 0) {
      return {
        ok: false,
        invalidIndex: i,
        message: `Game ${i + 1} has an invalid score.`
      };
    }

    if (a === b) {
      return {
        ok: false,
        invalidIndex: i,
        message: `Game ${i + 1} cannot end in a tie.`
      };
    }

    games.push({ a, b, normalized: `${a}-${b}` });
  }

  if (!games.length && !allowEmpty) {
    const firstEmptyIndex = inputs.findIndex((input) => !String(input.value || "").trim());
    return {
      ok: false,
      invalidIndex: firstEmptyIndex >= 0 ? firstEmptyIndex : 0,
      message: "Enter scores for at least 3 games."
    };
  }

  if (!allowEmpty && games.length < requiredInputCount) {
    const missingRequiredIndex = inputs.slice(0, requiredInputCount)
      .findIndex((input) => !String(input.value || "").trim());
    return {
      ok: false,
      invalidIndex: missingRequiredIndex >= 0 ? missingRequiredIndex : 0,
      message: "Enter scores for at least the first 3 games."
    };
  }

  return {
    ok: true,
    invalidIndex: null,
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
  const sortedRows = sortLeaderboardRows(state.leaderboard);
  const rankByTeam = buildLeaderboardRanks(sortedRows);
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
  const orderedTeamSet = new Set(orderedTeams.filter(Boolean));
  if (state.highlightTeam && !orderedTeamSet.has(state.highlightTeam)) {
    state.highlightTeam = "";
  }
  const teamColorMap = buildTeamColorMap(orderedTeams);
  const highlightControl = renderChartHighlightControl(orderedTeams, state.highlightTeam);
  const rankChart = renderCumulativePointsChart(orderedTeams, state.highlightTeam, teamColorMap);
  const ribbonChart = renderCumulativeRibbonChart(orderedTeams, state.highlightTeam, teamColorMap);

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
              const metricsContent = `<span><span class="metric-label">Wins:</span> <span class="metric-value">${escapeHtml(String(wins))}</span> <span class="metric-label">of</span> <span class="metric-value">${escapeHtml(String(gamesPlayed))}</span></span>
                  <span><span class="metric-label">Points:</span> <span class="metric-value ${pointsClass}">${escapeHtml(formatNumber(points, "points"))}</span></span>`;

              const metricsRow = detailRows.length
                ? `<details class="leaderboard-expand">
                    <summary class="leaderboard-card-metrics">
                      ${metricsContent}
                      <span class="expand-chevron" aria-hidden="true">&raquo;</span>
                    </summary>
                    <div class="leaderboard-expand-body">
                      <div class="leaderboard-round-header">
                        <span>Round</span>
                        <span>Opponent</span>
                        <span>Points</span>
                      </div>
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
                : `<div class="leaderboard-card-metrics">${metricsContent}</div>`;

              return `<article class="leaderboard-card">
                <div class="leaderboard-card-head">
                  <span class="leaderboard-rank">#${escapeHtml(String(rank))}</span>
                  <strong>${escapeHtml(team)}</strong>
                </div>
                ${metricsRow}
              </article>`;
            })
            .join("")}
        </div>
        ${highlightControl}
        ${rankChart}
        ${ribbonChart}`
    : "<p class=\"muted\">No leaderboard data for this filter.</p>";
}

function renderChartHighlightControl(teams, selectedTeam) {
  const options = [
    '<option value="">All teams</option>',
    ...teams
      .filter(Boolean)
      .map((team) => {
        const selected = selectedTeam === team ? " selected" : "";
        return `<option value="${escapeHtmlAttr(team)}"${selected}>${escapeHtml(team)}</option>`;
      })
  ].join("");

  return `
    <div class="leaderboard-chart-controls">
      <label class="highlight-team-filter" for="highlightTeamSelect">Highlight Team</label>
      <select id="highlightTeamSelect" aria-label="Highlight team on both leaderboard charts">
        ${options}
      </select>
    </div>
  `;
}

function buildTeamColorMap(teams) {
  const teamColorMap = new Map();
  teams
    .filter(Boolean)
    .forEach((team) => {
      if (teamColorMap.has(team)) return;
      const nextIdx = teamColorMap.size;
      teamColorMap.set(team, CHART_LINE_PALETTE[nextIdx % CHART_LINE_PALETTE.length]);
    });
  return teamColorMap;
}

function renderCumulativePointsChart(orderedTeams, highlightTeam = "", teamColorMap = new Map()) {
  const scoreView = config.views.scores;
  const leaderboardView = config.views.leaderboard;
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

  const allTeams = sortLeaderboardRows(state.leaderboard)
    .map((row) => String(row[leaderboardView.teamColumn] || "").trim())
    .filter(Boolean);

  const winsByTeamRound = new Map();
  const pointsByTeamRound = new Map();
  const globalTeamSet = new Set(allTeams);
  state.scores.forEach((row) => {
    const team = String(row[scoreView.teamColumn] || "").trim();
    if (!team || !globalTeamSet.has(team)) return;

    const round = String(row[scoreView.roundColumn] || "Round").trim();
    const winsKey = `${team}::${round}`;
    winsByTeamRound.set(
      winsKey,
      Number(winsByTeamRound.get(winsKey) || 0) + Number(row[scoreView.winsColumn] ?? row[scoreView.winnerFlagColumn] ?? 0)
    );

    const key = `${team}::${round}`;
    pointsByTeamRound.set(key, Number(pointsByTeamRound.get(key) || 0) + Number(row[scoreView.pointsColumn] ?? 0));
  });

  const displayedTeams = orderedTeams.filter(Boolean);
  const cumulativeWinsByTeam = new Map(allTeams.map((team) => [team, 0]));
  const cumulativeByTeam = new Map(allTeams.map((team) => [team, 0]));
  const rankByTeam = new Map(allTeams.map((team) => [team, []]));

  rounds.forEach((round) => {
    allTeams.forEach((team) => {
      const winsKey = `${team}::${round}`;
      const updatedWins = Number(cumulativeWinsByTeam.get(team) || 0) + Number(winsByTeamRound.get(winsKey) || 0);
      cumulativeWinsByTeam.set(team, updatedWins);

      const key = `${team}::${round}`;
      const updated = Number(cumulativeByTeam.get(team) || 0) + Number(pointsByTeamRound.get(key) || 0);
      cumulativeByTeam.set(team, updated);
    });

    const ranked = [...allTeams].sort((teamA, teamB) => {
      const winsDiff = Number(cumulativeWinsByTeam.get(teamB) || 0) - Number(cumulativeWinsByTeam.get(teamA) || 0);
      if (winsDiff !== 0) return winsDiff;
      const pointsDiff = Number(cumulativeByTeam.get(teamB) || 0) - Number(cumulativeByTeam.get(teamA) || 0);
      if (pointsDiff !== 0) return pointsDiff;
      return teamA.localeCompare(teamB);
    });

    let previousWins = null;
    let previousPoints = null;
    let previousRank = 0;
    ranked.forEach((team, idx) => {
      const wins = Number(cumulativeWinsByTeam.get(team) || 0);
      const points = Number(cumulativeByTeam.get(team) || 0);
      const rank = previousWins === wins && previousPoints === points ? previousRank : idx + 1;
      rankByTeam.get(team).push(rank);

      previousWins = wins;
      previousPoints = points;
      previousRank = rank;
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

  const activeHighlight = String(highlightTeam || "").trim();
  const dimColor = "#a2acb7";
  const highlightColor = "#0a9d75";
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
      const isHighlighted = activeHighlight && series.team === activeHighlight;
      const color = activeHighlight
        ? (isHighlighted ? highlightColor : dimColor)
        : (teamColorMap.get(series.team) || CHART_LINE_PALETTE[idx % CHART_LINE_PALETTE.length]);
      const strokeWidth = activeHighlight ? (isHighlighted ? 2.8 : 1.8) : 2;
      const strokeOpacity = activeHighlight ? (isHighlighted ? "0.98" : "0.72") : "1";
      const points = series.values
        .map((value, valueIdx) => `${xFor(valueIdx)},${yFor(value)}`)
        .join(" ");

      const pointDots = series.values
        .map((value, valueIdx) => {
          const cx = xFor(valueIdx);
          const cy = yFor(value);
          const rankTextClass = activeHighlight && !isHighlighted ? "chart-point-rank chart-point-rank-muted" : "chart-point-rank";
          return `<circle cx="${cx}" cy="${cy}" r="2.4" fill="${color}" data-team-select="${escapeHtmlAttr(series.team)}" />
            <text x="${cx + rankMarkerOffsetX}" y="${cy + rankMarkerOffsetY}" class="${rankTextClass}">${escapeHtml(String(value))}</text>`;
        })
        .join("");

      const lastRank = series.values.at(-1);
      const endLabel = lastRank
        ? `<text x="${xFor(rounds.length - 1) + endTeamLabelOffsetX}" y="${yFor(lastRank) + endTeamLabelOffsetY}" class="chart-end-label ${activeHighlight && !isHighlighted ? "chart-end-label-muted" : ""}" data-team-select="${escapeHtmlAttr(series.team)}">${escapeHtml(series.team)}</text>`
        : "";

      return `
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" data-team-select="${escapeHtmlAttr(series.team)}" />
        ${pointDots}
        ${endLabel}
      `;
    })
    .join("");

  return `
    <section class="leaderboard-chart">
      <h4>Rank Movement by Round</h4>
      <p class="muted">Lower rank is better (ranked by wins, then points).</p>
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

function renderCumulativeRibbonChart(orderedTeams, highlightTeam = "", teamColorMap = new Map()) {
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

  const activeHighlight = String(highlightTeam || "").trim();
  const dimColor = "#a2acb7";
  const highlightColor = "#0a9d75";

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

  const ribbonSegments = teamSeries
    .map((series, idx) => {
      const isHighlighted = activeHighlight && series.team === activeHighlight;
      const color = activeHighlight
        ? (isHighlighted ? highlightColor : dimColor)
        : (teamColorMap.get(series.team) || CHART_LINE_PALETTE[idx % CHART_LINE_PALETTE.length]);
      const isTop = topTeamSet.has(series.team);
      const linePoints = series.values
        .map((value, valueIdx) => `${xFor(valueIdx)},${yFor(value)}`)
        .join(" ");
      const pointDots = series.values
        .map((value, valueIdx) => {
          const dotRadius = activeHighlight ? (isHighlighted ? "2.8" : "2") : (isTop ? "2.6" : "1.9");
          const dotOpacity = activeHighlight ? (isHighlighted ? "0.95" : "0.55") : (isTop ? "0.95" : "0.6");
          return `<circle cx="${xFor(valueIdx)}" cy="${yFor(value)}" r="${dotRadius}" fill="${color}" fill-opacity="${dotOpacity}" data-team-select="${escapeHtmlAttr(series.team)}" />`;
        })
        .join("");

      const lineOpacity = activeHighlight ? (isHighlighted ? "0.92" : "0.5") : (isTop ? "0.9" : "0.45");
      const lineWidth = activeHighlight ? (isHighlighted ? "2.4" : "1.4") : (isTop ? "2.2" : "1.4");

      const endValue = series.values.at(-1);
      const labelClass = `chart-end-label ${isTop ? "chart-end-label-strong" : ""} ${activeHighlight && !isHighlighted ? "chart-end-label-muted" : ""}`.trim();
      const endLabelEntry = typeof endValue === "number"
        ? {
            team: series.team,
            color,
            className: labelClass,
            anchorX: xFor(rounds.length - 1),
            anchorY: yFor(endValue)
          }
        : null;

      return {
        markup: `
        <polyline points="${linePoints}" fill="none" stroke="${color}" stroke-opacity="${lineOpacity}" stroke-width="${lineWidth}" data-team-select="${escapeHtmlAttr(series.team)}" />
        ${pointDots}
      `,
        endLabelEntry
      };
    })
    ;

  const ribbons = ribbonSegments.map((segment) => segment.markup).join("");

  const labelEntries = ribbonSegments
    .map((segment) => segment.endLabelEntry)
    .filter(Boolean)
    .sort((a, b) => a.anchorY - b.anchorY);

  const labelMinGap = 12;
  const labelMinY = padTop + 8;
  const labelMaxY = height - padBottom - 4;

  let previousY = labelMinY - labelMinGap;
  labelEntries.forEach((entry) => {
    entry.labelY = Math.max(entry.anchorY, previousY + labelMinGap);
    previousY = entry.labelY;
  });

  for (let idx = labelEntries.length - 1; idx >= 0; idx -= 1) {
    const entry = labelEntries[idx];
    if (entry.labelY > labelMaxY) {
      entry.labelY = labelMaxY;
    }
    if (idx < labelEntries.length - 1) {
      const next = labelEntries[idx + 1];
      entry.labelY = Math.min(entry.labelY, next.labelY - labelMinGap);
    }
    entry.labelY = Math.max(entry.labelY, labelMinY);
  }

  const endLabels = labelEntries
    .map((entry) => {
      const labelX = entry.anchorX + 10;
      const connectorX2 = labelX - 3;
      return `
        <line x1="${entry.anchorX + 1}" y1="${entry.anchorY}" x2="${connectorX2}" y2="${entry.labelY - 3}" class="chart-label-connector" stroke="${entry.color}" data-team-select="${escapeHtmlAttr(entry.team)}" />
        <text x="${labelX}" y="${entry.labelY}" class="${entry.className}" data-team-select="${escapeHtmlAttr(entry.team)}">${escapeHtml(entry.team)}</text>
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
          ${endLabels}
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

function sortLeaderboardRows(rows) {
  const view = config.views.leaderboard;
  return [...rows].sort((a, b) => {
    const winsDiff = Number(b[view.winsColumn] ?? 0) - Number(a[view.winsColumn] ?? 0);
    if (winsDiff !== 0) return winsDiff;

    const pointsDiff = Number(b[view.pointsColumn] ?? 0) - Number(a[view.pointsColumn] ?? 0);
    if (pointsDiff !== 0) return pointsDiff;

    return String(a[view.teamColumn] || "").localeCompare(String(b[view.teamColumn] || ""));
  });
}

function buildLeaderboardRanks(sortedRows) {
  const view = config.views.leaderboard;
  const rankByTeam = new Map();
  let previousWins = null;
  let previousPoints = null;
  let previousRank = 0;

  sortedRows.forEach((row, index) => {
    const team = String(row[view.teamColumn] || "").trim();
    if (!team) return;

    const wins = Number(row[view.winsColumn] ?? 0);
    const points = Number(row[view.pointsColumn] ?? 0);
    const rank = previousWins === wins && previousPoints === points ? previousRank : index + 1;
    rankByTeam.set(team, rank);

    previousWins = wins;
    previousPoints = points;
    previousRank = rank;
  });

  return rankByTeam;
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
  state.highlightTeam = "";
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
