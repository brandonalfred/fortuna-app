---
name: nba-advanced-stats
description: Primary source for ALL NBA stats — season averages, game logs, advanced metrics, pace, usage, lineup analysis via nba_api
---

# NBA Stats (nba_api) — Primary NBA Data Source

The **primary** source for all NBA statistics. Returns bulk data (all ~524 players in one call), has a local player ID database (no API call needed for lookups), and doesn't consume any API quota.

## When to Use This

| Need | Tool |
|------|------|
| Season averages (PTS, REB, AST, etc.) for any/all players | **nba-advanced-stats** (`LeagueDashPlayerStats` base mode) |
| Per-game stats for hit rate / trend analysis | **nba-advanced-stats** (`PlayerGameLog`) |
| Pace, usage rate, offensive/defensive rating | **nba-advanced-stats** (`LeagueDashPlayerStats` advanced mode) |
| Per-100-possession stats | **nba-advanced-stats** |
| Opponent defensive tendencies by position | **nba-advanced-stats** |
| Lineup combinations and net rating | **nba-advanced-stats** |
| Player tracking (speed, distance, touches) | **nba-advanced-stats** |
| True shooting %, effective FG% | **nba-advanced-stats** |
| NBA data and nba_api is down/failing | `api-sports` (fallback) |
| NFL, MLB, NHL stats | `api-sports` (only option) |

**Routing rule:** For NBA, always try `nba-advanced-stats` first. Fall back to `api-sports` or web search only if nba_api requests fail after retries.

---

## Setup

```python
import subprocess, sys

try:
    from nba_api.stats.endpoints import LeagueDashPlayerStats
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "nba_api", "-q"])
    from nba_api.stats.endpoints import LeagueDashPlayerStats
```

## Proxy Configuration

NBA.com blocks cloud provider IPs. `WEBSHARE_PROXY_URL` contains a rotating residential proxy gateway URL (e.g. `http://user:pass@p.webshare.io:80/`). Each request through this gateway automatically gets a different residential IP from a 215K+ IP pool.

```python
import os

PROXY = os.environ.get("WEBSHARE_PROXY_URL", "").strip() or None

HEADERS = {
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "Referer": "https://www.nba.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}
```

## Rate Limiting & Retry Logic

The `safe_request` helper retries failed requests with delays. The residential proxy rotates IPs automatically on each attempt.

```python
import time

def safe_request(endpoint_class, max_retries=3, **kwargs):
    """Make an nba_api request with retry logic and residential proxy."""
    for attempt in range(1, max_retries + 1):
        try:
            time.sleep(2)
            endpoint = endpoint_class(
                proxy=PROXY,
                headers=HEADERS,
                timeout=30,
                **kwargs
            )
            return endpoint.get_data_frames()[0]
        except Exception as e:
            print(f"Attempt {attempt}/{max_retries} failed: {str(e)[:100]}")
            if attempt < max_retries:
                time.sleep(3)
    print("All attempts failed. Falling back to web search.")
    return None
```

---

## Player & Team ID Lookup

These lookups use a **local static database** bundled with nba_api — no API call or network request needed. Handles accented characters (Jokić, Dončić) automatically.

```python
from nba_api.stats.static import players, teams

def find_player_id(name: str) -> int:
    matches = players.find_players_by_full_name(name)
    if not matches:
        parts = name.lower().split()
        matches = [p for p in players.get_players() if any(part in p["full_name"].lower() for part in parts)]
    return matches[0]["id"] if matches else None

def find_team_id(name: str) -> int:
    matches = teams.find_teams_by_full_name(name)
    if not matches:
        matches = [t for t in teams.get_teams() if name.lower() in t["full_name"].lower() or name.lower() in t["abbreviation"].lower()]
    return matches[0]["id"] if matches else None
```

---

## Endpoints

### 1. Season Averages — All Players (Bulk)

Returns all ~524 active players' standard box score averages in a single call. Use this as the starting point for any NBA analysis — pull once, filter in Python.

```python
from nba_api.stats.endpoints import LeagueDashPlayerStats

df = safe_request(
    LeagueDashPlayerStats,
    season="2024-25",
    per_mode_detailed="PerGame"
)

# Key columns: PLAYER_NAME, TEAM_ABBREVIATION, GP, MIN, PTS, REB, AST,
#              STL, BLK, TOV, FGM, FGA, FG_PCT, FG3M, FG3A, FG3_PCT,
#              FTM, FTA, FT_PCT, OREB, DREB
```

### 2. Player Game Log (Per-Game Stats)

Per-game stats for an individual player — essential for hit rate calculation and trend analysis.

```python
from nba_api.stats.endpoints import PlayerGameLog

player_id = find_player_id("Tyrese Maxey")
df = safe_request(
    PlayerGameLog,
    player_id=player_id,
    season="2024-25"
)

# Key columns: GAME_DATE, MATCHUP, WL, MIN, PTS, REB, AST, STL, BLK,
#              TOV, FGM, FGA, FG_PCT, FG3M, FG3A, FG3_PCT, FTM, FTA,
#              FT_PCT, PLUS_MINUS
# Rows are ordered most recent first
```

### 3. Advanced Player Stats (USG%, PACE, Ratings, TS%, EFG%)

```python
from nba_api.stats.endpoints import LeagueDashPlayerStats

df = safe_request(
    LeagueDashPlayerStats,
    season="2024-25",
    measure_type_detailed_defense="Advanced",
    per_mode_detailed="PerGame"
)

# Key columns: PLAYER_NAME, USG_PCT, PACE, OFF_RATING, DEF_RATING,
#              NET_RATING, TS_PCT, EFG_PCT, AST_PCT, AST_TO
```

### 4. Per-100-Possession Stats (Pace-Adjusted)

```python
from nba_api.stats.endpoints import LeagueDashPlayerStats

df = safe_request(
    LeagueDashPlayerStats,
    season="2024-25",
    per_mode_detailed="Per100Possessions"
)

# Key columns: PLAYER_NAME, PTS, REB, AST, STL, BLK, FGA, FG3A
# These are pace-normalized — use for fair cross-team comparisons
```

### 5. Advanced Team Stats (Pace Rankings, Efficiency)

```python
from nba_api.stats.endpoints import LeagueDashTeamStats

df = safe_request(
    LeagueDashTeamStats,
    season="2024-25",
    measure_type_detailed_defense="Advanced",
    per_mode_detailed="PerGame"
)

# Key columns: TEAM_NAME, PACE, OFF_RATING, DEF_RATING, NET_RATING,
#              EFG_PCT, TS_PCT, AST_RATIO, REB_PCT
# Sort by PACE to find fastest/slowest teams
```

### 6. Opponent Defensive Tendencies

```python
from nba_api.stats.endpoints import LeagueDashPlayerStats

df = safe_request(
    LeagueDashPlayerStats,
    season="2024-25",
    measure_type_detailed_defense="Advanced",
    opponent_team_id=find_team_id("Sacramento Kings")
)

# Filter by player to see how they perform against a specific defense
```

### 7. Lineup Analysis (Net Rating by Lineup Combination)

```python
from nba_api.stats.endpoints import TeamDashLineups

df = safe_request(
    TeamDashLineups,
    team_id=find_team_id("Philadelphia 76ers"),
    season="2024-25",
    measure_type_detailed_defense="Advanced",
    group_quantity=5
)

# Key columns: GROUP_NAME (player names), MIN, PLUS_MINUS, NET_RATING,
#              OFF_RATING, DEF_RATING, PACE
# Use group_quantity=2 for two-man combos
```

### 8. Player Tracking Stats (Speed, Distance, Touches)

```python
from nba_api.stats.endpoints import LeagueDashPtStats

df = safe_request(
    LeagueDashPtStats,
    season="2024-25",
    pt_measure_type="SpeedDistance"
)

# Key columns: PLAYER_NAME, DIST_MILES, AVG_SPEED, DIST_MILES_OFF, DIST_MILES_DEF

# For touches:
df_touches = safe_request(
    LeagueDashPtStats,
    season="2024-25",
    pt_measure_type="Possessions"
)
# Key columns: TOUCHES, FRONT_CT_TOUCHES, TIME_OF_POSS, ELBOW_TOUCHES, PAINT_TOUCHES
```

### 9. Per-Game Usage Rate (Box Score)

```python
from nba_api.stats.endpoints import BoxScoreUsageV3

df = safe_request(
    BoxScoreUsageV3,
    game_id="0022400123"
)

# Key columns: PLAYER_NAME, USG_PCT, PCT_FGA, PCT_FGA_2PT, PCT_FGA_3PT,
#              PCT_FTA, PCT_OREB, PCT_DREB, PCT_AST, PCT_TOV
# Use for analyzing usage redistribution in specific games
```

---

## Betting Analysis Patterns

### Pattern 1: Hit Rate Calculation (Player Props)

Use `PlayerGameLog` + pandas to calculate how often a player clears a prop line.

```python
import pandas as pd
from nba_api.stats.endpoints import PlayerGameLog

def calculate_hit_rate(player_name: str, stat: str, line: float, season: str = "2024-25", last_n: int = None):
    """Calculate how often a player exceeds a prop line.

    Args:
        player_name: Full name (e.g., "Tyrese Maxey")
        stat: Column name — "PTS", "REB", "AST", "FG3M", "STL", "BLK", etc.
        line: The prop line to check against (e.g., 26.5)
        season: NBA season string
        last_n: If set, only use the last N games
    """
    player_id = find_player_id(player_name)
    df = safe_request(PlayerGameLog, player_id=player_id, season=season)
    if df is None or df.empty:
        return None

    if last_n:
        df = df.head(last_n)

    hits = (df[stat] > line).sum()
    total = len(df)

    return {
        "player": player_name,
        "stat": stat,
        "line": line,
        "games": total,
        "hits": int(hits),
        "hit_rate": round(hits / total * 100, 1) if total else 0,
        "average": round(df[stat].mean(), 1),
        "median": round(df[stat].median(), 1),
        "max": int(df[stat].max()),
        "min": int(df[stat].min()),
        "last_5_avg": round(df.head(5)[stat].mean(), 1),
    }
```

### Pattern 2: Trend Detection (Hot/Cold Streaks)

```python
def detect_trend(player_name: str, stat: str, season: str = "2024-25", recent_n: int = 5):
    """Compare recent performance to season average."""
    player_id = find_player_id(player_name)
    df = safe_request(PlayerGameLog, player_id=player_id, season=season)
    if df is None or len(df) < recent_n:
        return None

    recent_avg = df.head(recent_n)[stat].mean()
    season_avg = df[stat].mean()
    pct_change = ((recent_avg - season_avg) / season_avg * 100) if season_avg else 0

    return {
        "player": player_name,
        "stat": stat,
        "recent_avg": round(recent_avg, 1),
        "season_avg": round(season_avg, 1),
        "pct_change": round(pct_change, 1),
        "trend": "HOT" if pct_change > 10 else "COLD" if pct_change < -10 else "NEUTRAL",
        "last_5_values": df.head(5)[stat].tolist(),
    }
```

### Pattern 3: Bulk Parlay Screening

When building a parlay, pull bulk data first and filter programmatically instead of looking up players one at a time.

```python
from nba_api.stats.endpoints import LeagueDashPlayerStats

def screen_prop_candidates(stat: str, min_games: int = 20, min_avg: float = 15.0, season: str = "2024-25"):
    """Find players who consistently hit over a stat threshold.

    Use this to narrow down parlay candidates before doing deep dives.
    """
    df = safe_request(LeagueDashPlayerStats, season=season, per_mode_detailed="PerGame")
    if df is None:
        return None

    # Filter to players with enough games and a high enough average
    candidates = df[(df["GP"] >= min_games) & (df[stat] >= min_avg)].copy()
    candidates = candidates.sort_values(stat, ascending=False)

    return candidates[["PLAYER_NAME", "TEAM_ABBREVIATION", "GP", "MIN", stat]].head(30)
```

### Pattern 4: Pace Matchup Analysis (Over/Under Impact)

```python
from nba_api.stats.endpoints import LeagueDashTeamStats

def pace_matchup_analysis(team1: str, team2: str, season: str = "2024-25"):
    """Analyze pace matchup for over/under implications."""
    df = safe_request(
        LeagueDashTeamStats,
        season=season,
        measure_type_detailed_defense="Advanced"
    )
    if df is None:
        return None

    league_avg_pace = df["PACE"].mean()
    t1 = df[df["TEAM_NAME"].str.contains(team1, case=False)]
    t2 = df[df["TEAM_NAME"].str.contains(team2, case=False)]

    if t1.empty or t2.empty:
        return {"error": "Team not found"}

    t1_pace = t1.iloc[0]["PACE"]
    t2_pace = t2.iloc[0]["PACE"]
    expected_pace = (t1_pace + t2_pace) / 2

    return {
        "team1_pace": round(t1_pace, 1),
        "team2_pace": round(t2_pace, 1),
        "expected_game_pace": round(expected_pace, 1),
        "league_avg_pace": round(league_avg_pace, 1),
        "pace_delta": round(expected_pace - league_avg_pace, 1),
        "implication": "OVER lean" if expected_pace > league_avg_pace + 1 else "UNDER lean" if expected_pace < league_avg_pace - 1 else "Neutral pace",
        "team1_off_rating": round(float(t1.iloc[0]["OFF_RATING"]), 1),
        "team2_off_rating": round(float(t2.iloc[0]["OFF_RATING"]), 1),
        "team1_def_rating": round(float(t1.iloc[0]["DEF_RATING"]), 1),
        "team2_def_rating": round(float(t2.iloc[0]["DEF_RATING"]), 1),
    }
```

### Pattern 5: Usage Redistribution (Key Player Out)

```python
from nba_api.stats.endpoints import LeagueDashPlayerStats

def usage_without_player(team: str, missing_player: str, season: str = "2024-25"):
    """Estimate usage redistribution when a key player is out."""
    df = safe_request(
        LeagueDashPlayerStats,
        season=season,
        measure_type_detailed_defense="Advanced"
    )
    if df is None:
        return None

    team_id = find_team_id(team)
    team_players = df[df["TEAM_ID"] == team_id].sort_values("USG_PCT", ascending=False)

    missing = team_players[team_players["PLAYER_NAME"].str.contains(missing_player, case=False)]
    if missing.empty:
        return {"error": f"{missing_player} not found on {team}"}

    missing_usg = float(missing.iloc[0]["USG_PCT"])
    missing_min = float(missing.iloc[0]["MIN"])
    remaining = team_players[~team_players["PLAYER_NAME"].str.contains(missing_player, case=False)]

    total_remaining_usg = float(remaining["USG_PCT"].sum())
    top_beneficiaries = remaining.head(5)[["PLAYER_NAME", "USG_PCT", "MIN", "PTS", "AST"]].copy()

    top_beneficiaries["PROJECTED_USG_BOOST"] = top_beneficiaries["USG_PCT"].apply(
        lambda u: round(float(u) / total_remaining_usg * missing_usg * 100, 1)
    )

    return {
        "missing_player": missing_player,
        "missing_usg_pct": round(missing_usg * 100, 1),
        "missing_minutes": round(missing_min, 1),
        "beneficiaries": top_beneficiaries[["PLAYER_NAME", "USG_PCT", "PROJECTED_USG_BOOST"]].to_dict("records"),
    }
```

### Pattern 6: Defensive Vulnerability by Position

```python
from nba_api.stats.endpoints import LeagueDashPlayerStats

def defensive_vulnerability(opponent_team: str, player_position: str = "Guard", season: str = "2024-25"):
    """Find how much a defense struggles against a specific position."""
    df = safe_request(
        LeagueDashPlayerStats,
        season=season,
        measure_type_detailed_defense="Advanced",
        per_mode_detailed="PerGame"
    )
    if df is None:
        return None

    opp_id = find_team_id(opponent_team)

    position_map = {"Guard": ["PG", "SG"], "Forward": ["SF", "PF"], "Center": ["C"]}
    positions = position_map.get(player_position, [player_position])

    opp_df = safe_request(
        LeagueDashPlayerStats,
        season=season,
        measure_type_detailed_defense="Advanced",
        opponent_team_id=opp_id,
        per_mode_detailed="PerGame"
    )

    if opp_df is None or opp_df.empty:
        return {"error": "No data for opponent filter"}

    if "PLAYER_POSITION" in opp_df.columns:
        opp_df = opp_df[opp_df["PLAYER_POSITION"].isin(positions)]

    if "PLAYER_POSITION" in df.columns:
        league_avg = float(df[df["PLAYER_POSITION"].isin(positions)]["OFF_RATING"].mean())
    else:
        league_avg = float(df["OFF_RATING"].mean()) if "OFF_RATING" in df.columns else None

    avg_off_rating = float(opp_df["OFF_RATING"].mean()) if "OFF_RATING" in opp_df.columns and not opp_df.empty else None

    return {
        "opponent": opponent_team,
        "position": player_position,
        "avg_off_rating_vs_opponent": round(avg_off_rating, 1) if avg_off_rating else "N/A",
        "league_avg_off_rating": round(league_avg, 1) if league_avg else "N/A",
        "delta": round(avg_off_rating - league_avg, 1) if avg_off_rating and league_avg else "N/A",
        "verdict": "Exploitable" if avg_off_rating and league_avg and avg_off_rating > league_avg + 2 else "Average" if avg_off_rating and league_avg and abs(avg_off_rating - league_avg) <= 2 else "Tough matchup",
    }
```

---

## Season Format

nba_api uses `"YYYY-YY"` format for seasons:

| NBA Season | nba_api Value |
|------------|---------------|
| 2024-25 | `"2024-25"` |
| 2023-24 | `"2023-24"` |
| 2022-23 | `"2022-23"` |

---

## Fallback Strategy

If nba_api requests fail after 3 retries (timeouts, rate limits):

1. `safe_request` returns `None` after exhausting retries — each retry gets a fresh residential IP automatically
2. **Fall back to `api-sports`** for the same NBA data (game logs, season stats)
3. **Web search** for the same data on Basketball Reference, Statmuse, or NBA.com
4. **Cite** that the data was sourced from a fallback rather than the primary API

Example fallback:
```
nba_api is currently unavailable. Sourcing from API-Sports instead.
# Or if API-Sports also fails:
Web search: "Tyrese Maxey stats 2024-25 basketball reference"
```

---

## Complementary Tools

| Tool | Priority for NBA | Use For |
|------|-----------------|---------|
| **nba-advanced-stats** | PRIMARY | All NBA stats — season averages, game logs, advanced metrics, pace, usage, lineup data |
| **api-sports** | FALLBACK (NBA) / PRIMARY (other sports) | NBA fallback if nba_api fails; primary for NFL, MLB, NHL |
| **odds-api** | — | Current lines and odds comparison |
| **Web search** | LAST RESORT | Injury reports, news, fallback stats if both APIs fail |
