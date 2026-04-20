window.APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLIC_ANON_KEY",
  views: {
    passcodes: {
      name: "passcodeleagueid",
      passcodeColumn: "passcode",
      leagueColumn: "league_id",
      leagueNameColumn: "league_id"
    },
    games: {
      name: "vw_schdlgames",
      leagueColumn: "league_id",
      alternateLeagueColumn: "formid",
      teamColumn: "team_a",
      homeTeamColumn: "team_a",
      awayTeamColumn: "team_b",
      datetimeColumn: "date",
      courtColumn: "comments"
    },
    scores: {
      name: "vw_rpt_ldrboard",
      leagueColumn: "formid",
      alternateLeagueColumn: "league_id",
      plannedColumn: "is_planned",
      plannedValue: false,
      teamColumn: "team",
      opponentColumn: "opponent_team",
      teamScoreColumn: "points",
      opponentScoreColumn: "",
      completedAtColumn: "round",
      winsColumn: "is_winner",
      winnerFlagColumn: "is_winner",
      roundColumn: "round",
      pointsColumn: "points"
    },
    contact: {
      name: "vw_schdlgames_contact",
      teamIdColumn: "team_id",
      phonesColumn: "phones",
      playerPhonesColumn: "player_phones"
    },
    leaderboard: {
      teamColumn: "team_name",
      pointsColumn: "points",
      winsColumn: "wins"
    }
  }
};
