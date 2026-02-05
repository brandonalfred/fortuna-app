---
name: nba-advanced-stats
description: NBA advanced analytics via nba_api — pace, usage rate, per-100-possession stats, opponent defense, and lineup analysis
---

# NBA Advanced Stats (nba_api)

Advanced NBA analytics for betting analysis: pace, usage rate, efficiency ratings, per-100-possession stats, opponent defensive tendencies, and lineup data.

## When to Use This vs api-sports

| Question | Use |
|----------|-----|
| Basic box score stats (PPG, RPG, APG) | api-sports |
| Hit rate over a prop line | api-sports |
| Pace, usage rate, offensive/defensive rating | **nba-advanced-stats** |
| Per-100-possession stats | **nba-advanced-stats** |
| Opponent defensive tendencies by position | **nba-advanced-stats** |
| Lineup combinations and net rating | **nba-advanced-stats** |
| Player tracking (speed, distance, touches) | **nba-advanced-stats** |
| True shooting %, effective FG% | **nba-advanced-stats** |

Use **both** together for comprehensive analysis — api-sports for game logs and hit rates, nba-advanced-stats for contextual metrics.

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

NBA.com blocks cloud provider IPs. `WEBSHARE_PROXY_URL` contains multiple proxies (comma-separated). The `safe_request` helper automatically rotates through them on failure.

```python
import os, random

PROXY_LIST = [p.strip() for p in os.environ.get("WEBSHARE_PROXY_URL", "").split(",") if p.strip()]
random.shuffle(PROXY_LIST)

HEADERS = {
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "Referer": "https://www.nba.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}
```

## Rate Limiting & Proxy Rotation

The `safe_request` helper rotates through proxies on failure and adds delays to avoid throttling:

```python
import time

def safe_request(endpoint_class, **kwargs):
    """Make an nba_api request with proxy rotation and retry logic."""
    proxies_to_try = PROXY_LIST if PROXY_LIST else [""]
    for proxy in proxies_to_try:
        try:
            time.sleep(2)
            endpoint = endpoint_class(
                proxy=proxy,
                headers=HEADERS,
                timeout=30,
                **kwargs
            )
            return endpoint.get_data_frames()[0]
        except Exception as e:
            print(f"Proxy {proxy[:30]}... failed: {e}")
            time.sleep(2)
    print("All proxies exhausted. Falling back to web search.")
    return None
```

---

## Player & Team ID Lookup

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

### 1. Advanced Player Stats (USG%, PACE, Ratings, TS%, EFG%)

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

### 2. Per-100-Possession Stats (Pace-Adjusted)

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

### 3. Advanced Team Stats (Pace Rankings, Efficiency)

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

### 4. Opponent Defensive Tendencies

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

### 5. Lineup Analysis (Net Rating by Lineup Combination)

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

### 6. Player Tracking Stats (Speed, Distance, Touches)

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

### 7. Per-Game Usage Rate (Box Score)

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

### Pattern 1: Pace Matchup Analysis (Over/Under Impact)

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

### Pattern 2: Usage Redistribution (Key Player Out)

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

### Pattern 3: Defensive Vulnerability by Position

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

If nba_api requests fail (IP blocks, timeouts, rate limits):

1. **Retry** with the `safe_request` helper (3 attempts with backoff)
2. **Web search** for the same data on Basketball Reference, Statmuse, or NBA.com
3. **Cite** that the data was sourced from web search rather than the API directly

Example fallback:
```
nba_api is currently unavailable. Sourcing from Basketball Reference instead.
Web search: "Tyrese Maxey advanced stats 2024-25 basketball reference"
```

---

## Complementary Tools

| Tool | Use For |
|------|---------|
| **api-sports** | Game logs, hit rates, basic box score stats |
| **nba-advanced-stats** | Pace, usage, efficiency, lineup data |
| **odds-api** | Current lines and odds comparison |
| **Web search** | Injury reports, news, fallback stats |
