---
name: api-sports
description: Query player/team stats from API-Sports for multi-sport betting analysis (NBA, NFL, MLB, NHL)
---

# API-Sports Integration

Access player and team statistics via API-Sports.io for data-driven betting analysis.

## Authentication

```bash
x-apisports-key: ${API_SPORTS_KEY}
```

All requests require this header.

## Sport-Specific APIs

Each sport has its own base URL and API version:

| Sport | Base URL | Version |
|-------|----------|---------|
| NBA | `https://v2.nba.api-sports.io` | v2 |
| NFL | `https://v1.american-football.api-sports.io` | v1 |
| MLB | `https://v1.baseball.api-sports.io` | v1 |
| NHL | `https://v1.hockey.api-sports.io` | v1 |

---

## NBA Endpoints

### Get Games by Date

```bash
curl -s "https://v2.nba.api-sports.io/games?date=2025-01-15" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

Response fields: `id`, `date`, `time`, `status`, `teams.home`, `teams.away`, `scores`

### Search Players

```bash
curl -s "https://v2.nba.api-sports.io/players?search=maxey" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

Returns: `id`, `firstname`, `lastname`, `birth.date`, `nba.start`, `nba.pro`, `height`, `weight`, `college`, `affiliation`

### Player Statistics by Season

```bash
curl -s "https://v2.nba.api-sports.io/players/statistics?id=265&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

**Key stat fields:**
- `points`, `assists`, `rebounds` (totals + offReb/defReb)
- `steals`, `blocks`, `turnovers`
- `fgm/fga/fgp` (field goals made/attempted/percentage)
- `tpm/tpa/tpp` (three pointers)
- `ftm/fta/ftp` (free throws)
- `min` (minutes played)
- `plusMinus`

### Player Statistics by Game

```bash
curl -s "https://v2.nba.api-sports.io/players/statistics?id=265&game=12345" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Team Statistics

```bash
curl -s "https://v2.nba.api-sports.io/teams/statistics?id=20&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Standings

```bash
curl -s "https://v2.nba.api-sports.io/standings?league=standard&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### NBA Team IDs (Common)

| ID | Team |
|----|------|
| 1 | Atlanta Hawks |
| 2 | Boston Celtics |
| 4 | Brooklyn Nets |
| 5 | Charlotte Hornets |
| 6 | Chicago Bulls |
| 7 | Cleveland Cavaliers |
| 8 | Dallas Mavericks |
| 9 | Denver Nuggets |
| 10 | Detroit Pistons |
| 11 | Golden State Warriors |
| 14 | Houston Rockets |
| 15 | Indiana Pacers |
| 16 | LA Clippers |
| 17 | Los Angeles Lakers |
| 19 | Memphis Grizzlies |
| 20 | Miami Heat |
| 21 | Milwaukee Bucks |
| 22 | Minnesota Timberwolves |
| 23 | New Orleans Pelicans |
| 24 | New York Knicks |
| 25 | Oklahoma City Thunder |
| 26 | Orlando Magic |
| 27 | Philadelphia 76ers |
| 28 | Phoenix Suns |
| 29 | Portland Trail Blazers |
| 30 | Sacramento Kings |
| 31 | San Antonio Spurs |
| 38 | Toronto Raptors |
| 40 | Utah Jazz |
| 41 | Washington Wizards |

---

## NFL Endpoints

### Get Games by Date

```bash
curl -s "https://v1.american-football.api-sports.io/games?date=2025-01-12" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Get Games by Season/Week

```bash
curl -s "https://v1.american-football.api-sports.io/games?league=1&season=2024&week=15" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

League ID 1 = NFL

### Search Players

```bash
curl -s "https://v1.american-football.api-sports.io/players?search=mahomes" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Player Statistics by Season

```bash
curl -s "https://v1.american-football.api-sports.io/players/statistics?id=1234&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

**Passing stats:** `passing.attempts`, `passing.completions`, `passing.yards`, `passing.touchdowns`, `passing.interceptions`, `passing.rating`

**Rushing stats:** `rushing.attempts`, `rushing.yards`, `rushing.touchdowns`, `rushing.long`

**Receiving stats:** `receiving.receptions`, `receiving.yards`, `receiving.touchdowns`, `receiving.targets`, `receiving.long`

**Defense stats:** `defense.tackles`, `defense.sacks`, `defense.interceptions`, `defense.forced_fumbles`

### Player Statistics by Game

```bash
curl -s "https://v1.american-football.api-sports.io/players/statistics?id=1234&game=5678" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Team Statistics

```bash
curl -s "https://v1.american-football.api-sports.io/teams/statistics?id=1&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Standings

```bash
curl -s "https://v1.american-football.api-sports.io/standings?league=1&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

---

## MLB Endpoints

### Get Games by Date

```bash
curl -s "https://v1.baseball.api-sports.io/games?date=2025-07-15" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Get Games by Season

```bash
curl -s "https://v1.baseball.api-sports.io/games?league=1&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

League ID 1 = MLB

### Search Players

```bash
curl -s "https://v1.baseball.api-sports.io/players?search=ohtani" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Player Statistics by Season (Batting)

```bash
curl -s "https://v1.baseball.api-sports.io/players/statistics?id=1234&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

**Batting stats:** `games`, `at_bats`, `runs`, `hits`, `doubles`, `triples`, `home_runs`, `rbi`, `stolen_bases`, `walks`, `strikeouts`, `avg`, `obp`, `slg`, `ops`

**Pitching stats:** `games`, `games_started`, `wins`, `losses`, `era`, `innings_pitched`, `hits_allowed`, `runs_allowed`, `earned_runs`, `walks`, `strikeouts`, `whip`, `saves`, `holds`

### Team Statistics

```bash
curl -s "https://v1.baseball.api-sports.io/teams/statistics?id=1&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Standings

```bash
curl -s "https://v1.baseball.api-sports.io/standings?league=1&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

---

## NHL Endpoints

### Get Games by Date

```bash
curl -s "https://v1.hockey.api-sports.io/games?date=2025-01-15" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Get Games by Season

```bash
curl -s "https://v1.hockey.api-sports.io/games?league=57&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

League ID 57 = NHL

### Search Players

```bash
curl -s "https://v1.hockey.api-sports.io/players?search=mcdavid" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Player Statistics by Season

```bash
curl -s "https://v1.hockey.api-sports.io/players/statistics?id=1234&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

**Skater stats:** `games`, `goals`, `assists`, `points`, `plus_minus`, `pim` (penalty minutes), `shots`, `hits`, `blocks`, `time_on_ice`, `powerplay_goals`, `powerplay_assists`, `shorthanded_goals`

**Goalie stats:** `games`, `wins`, `losses`, `ot_losses`, `saves`, `goals_against`, `save_percentage`, `gaa` (goals against average), `shutouts`, `time_on_ice`

### Team Statistics

```bash
curl -s "https://v1.hockey.api-sports.io/teams/statistics?id=1&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

### Standings

```bash
curl -s "https://v1.hockey.api-sports.io/standings?league=57&season=2024" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

---

## Analysis Patterns

When analyzing player props or team bets, write Python code to calculate statistics.

### Hit Rate Calculation

For prop bets like "Tyrese Maxey over 26.5 points":

```python
import json
import subprocess

def fetch_player_stats(player_id: int, season: int) -> list:
    """Fetch player's game-by-game stats for a season."""
    result = subprocess.run([
        "curl", "-s",
        f"https://v2.nba.api-sports.io/players/statistics?id={player_id}&season={season}",
        "-H", f"x-apisports-key: {os.environ['API_SPORTS_KEY']}"
    ], capture_output=True, text=True)
    data = json.loads(result.stdout)
    return data.get("response", [])

def calculate_hit_rate(games: list, stat: str, line: float) -> dict:
    """Calculate how often a player exceeds a line."""
    valid_games = [g for g in games if g.get(stat) is not None]
    hits = sum(1 for g in valid_games if g[stat] > line)

    return {
        "games_analyzed": len(valid_games),
        "hits": hits,
        "hit_rate": hits / len(valid_games) if valid_games else 0,
        "average": sum(g[stat] for g in valid_games) / len(valid_games) if valid_games else 0,
        "median": sorted([g[stat] for g in valid_games])[len(valid_games)//2] if valid_games else 0,
        "max": max(g[stat] for g in valid_games) if valid_games else 0,
        "min": min(g[stat] for g in valid_games) if valid_games else 0,
    }
```

### Trend Detection (Hot/Cold Streaks)

```python
def analyze_trend(games: list, stat: str, recent_n: int = 5) -> dict:
    """Compare recent performance to season average."""
    if len(games) < recent_n:
        return {"error": "Not enough games"}

    # Sort by date (most recent first)
    sorted_games = sorted(games, key=lambda g: g.get("game", {}).get("date", ""), reverse=True)

    recent = sorted_games[:recent_n]
    season = sorted_games

    recent_avg = sum(g[stat] for g in recent) / len(recent)
    season_avg = sum(g[stat] for g in season) / len(season)

    pct_change = ((recent_avg - season_avg) / season_avg * 100) if season_avg else 0

    return {
        "recent_avg": round(recent_avg, 1),
        "season_avg": round(season_avg, 1),
        "trend": "hot" if pct_change > 10 else "cold" if pct_change < -10 else "neutral",
        "pct_change": round(pct_change, 1),
    }
```

### Matchup Analysis

```python
def analyze_vs_team(games: list, opponent_team_id: int, stat: str) -> dict:
    """Analyze player performance against a specific team."""
    vs_team = [g for g in games if g.get("team", {}).get("id") == opponent_team_id]
    vs_others = [g for g in games if g.get("team", {}).get("id") != opponent_team_id]

    if not vs_team:
        return {"error": "No games against this opponent"}

    vs_team_avg = sum(g[stat] for g in vs_team) / len(vs_team)
    vs_others_avg = sum(g[stat] for g in vs_others) / len(vs_others) if vs_others else 0

    return {
        "vs_team_games": len(vs_team),
        "vs_team_avg": round(vs_team_avg, 1),
        "vs_others_avg": round(vs_others_avg, 1),
        "advantage": "favorable" if vs_team_avg > vs_others_avg else "unfavorable",
    }
```

### Home/Away Splits

```python
def analyze_home_away(games: list, stat: str) -> dict:
    """Compare home vs away performance."""
    home_games = [g for g in games if g.get("game", {}).get("home", False)]
    away_games = [g for g in games if not g.get("game", {}).get("home", False)]

    home_avg = sum(g[stat] for g in home_games) / len(home_games) if home_games else 0
    away_avg = sum(g[stat] for g in away_games) / len(away_games) if away_games else 0

    return {
        "home_games": len(home_games),
        "home_avg": round(home_avg, 1),
        "away_games": len(away_games),
        "away_avg": round(away_avg, 1),
        "home_boost": round(home_avg - away_avg, 1),
    }
```

---

## Output Guidelines

When presenting analysis:

1. **Lead with the recommendation** - Clear over/under verdict with confidence level
2. **Show the key numbers** - Hit rate, recent trend, relevant splits
3. **Provide context** - Why the numbers support the recommendation
4. **Note caveats** - Injuries, rest days, matchup factors
5. **Detailed data on request** - Full game logs, extended splits available if asked

### Example Output Format

```
**Tyrese Maxey Over 26.5 Points** → LEAN OVER (68% confidence)

**Hit Rate:** 14/20 games (70%) this season
**Recent Trend:** Averaging 29.3 pts last 5 games (↑12% from 26.1 season avg)
**Tonight's Matchup:** vs MIA - historically scores 28.5 PPG against Heat (3 games)

**Supporting Factors:**
- Joel Embiid OUT → Maxey usage rate increases ~8%
- Heat allow 4th-most points to opposing PGs
- B2B but well-rested (2 days off prior)

*Want detailed game-by-game logs? Just ask.*
```

---

## Rate Limits & Best Practices

- API-Sports has daily request limits based on subscription tier
- Cache player IDs after initial lookup
- Batch game lookups by date range when possible
- For historical analysis, request full season data once rather than game-by-game
- Use the `season` parameter to limit data scope

## Complementary Tools

Use alongside the `odds-api` skill for complete analysis:
- **API-Sports**: Player/team statistics, trends, matchups
- **The Odds API**: Current lines, odds comparison, line movement
