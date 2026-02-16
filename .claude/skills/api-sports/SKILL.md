---
name: api-sports
description: Query player/team stats from API-Sports for multi-sport betting analysis (NBA, NFL, MLB, NHL, Soccer)
---

# API-Sports Integration

Access player and team statistics via API-Sports.io for data-driven betting analysis.

> **NBA routing note:** For NBA stats, prefer `nba-advanced-stats` first — it returns all ~524 players in one bulk call, has local player ID lookups (no API call needed), and doesn't consume API quota. Use `api-sports` as a **fallback** for NBA if nba_api is down or failing. For NFL, MLB, NHL, and Soccer, `api-sports` remains the **primary** source.

## Authentication

```bash
x-apisports-key: ${API_SPORTS_KEY}
```

All requests require this header.

**Important:** Read the API key from config before API calls:
```bash
API_SPORTS_KEY=$(grep '^API_SPORTS_KEY=' /vercel/sandbox/.agent-env | cut -d'=' -f2-)
```

## Sport-Specific APIs

Each sport has its own base URL and API version:

| Sport | Base URL | Version |
|-------|----------|---------|
| NBA | `https://v2.nba.api-sports.io` | v2 |
| NFL | `https://v1.american-football.api-sports.io` | v1 |
| MLB | `https://v1.baseball.api-sports.io` | v1 |
| NHL | `https://v1.hockey.api-sports.io` | v1 |
| Football (Soccer) | `https://v3.football.api-sports.io` | v3 |

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

## Football (Soccer) Endpoints

Base URL: `https://v3.football.api-sports.io`

Uses the same `x-apisports-key` header as other sports.

**Season format:** Year (e.g., `2025` for the 2025-26 season).

### League IDs

| ID | League |
|----|--------|
| 39 | Premier League (England) |
| 140 | La Liga (Spain) |
| 78 | Bundesliga (Germany) |
| 135 | Serie A (Italy) |
| 61 | Ligue 1 (France) |
| 2 | Champions League |
| 3 | Europa League |
| 253 | MLS |
| 262 | Liga MX |

### Common Team IDs

| ID | Team |
|----|------|
| 529 | Barcelona |
| 541 | Real Madrid |
| 530 | Atletico Madrid |
| 33 | Manchester United |
| 40 | Liverpool |
| 42 | Arsenal |
| 49 | Chelsea |
| 50 | Manchester City |
| 157 | Bayern Munich |
| 489 | AC Milan |
| 496 | Juventus |
| 85 | Paris Saint-Germain |

### Get Fixtures by Date

```bash
curl -s "https://v3.football.api-sports.io/fixtures?date=2025-02-15" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

Returns all matches across leagues for a given date. Useful for discovery ("what soccer is on tonight?").

### Search Players

```bash
curl -s "https://v3.football.api-sports.io/players?search=lewandowski&league=140&season=2025" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

Returns: `id`, `name`, `firstname`, `lastname`, `age`, `birth`, `nationality`, `height`, `weight`, `photo`

### Player Season Statistics

```bash
curl -s "https://v3.football.api-sports.io/players?id=521&season=2025&league=140" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

**Key stat fields:**
- `games.appearences`, `games.minutes`, `games.rating`
- `goals.total`, `goals.assists`
- `shots.total`, `shots.on` (on target)
- `passes.total`, `passes.key`, `passes.accuracy`
- `tackles.total`, `tackles.blocks`, `tackles.interceptions`
- `duels.total`, `duels.won`
- `dribbles.attempts`, `dribbles.success`
- `fouls.drawn`, `fouls.committed`
- `cards.yellow`, `cards.red`
- `penalty.scored`, `penalty.missed`

### Team Statistics

```bash
curl -s "https://v3.football.api-sports.io/teams/statistics?team=529&league=140&season=2025" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

Returns: goals scored/conceded, clean sheets, form, biggest wins/losses, fixtures played/won/drawn/lost (home/away splits).

### Standings

```bash
curl -s "https://v3.football.api-sports.io/standings?league=140&season=2025" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

Returns: league table with rank, points, goal difference, form, home/away records.

### Fixture Lineups

```bash
curl -s "https://v3.football.api-sports.io/fixtures/lineups?fixture={fixture_id}" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

Available 20-40 min before kickoff. Returns formation, starting XI, and substitutes.

### Injuries by Date

```bash
curl -s "https://v3.football.api-sports.io/injuries?date=2025-02-15" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

Returns all injuries across leagues for a given date.

### Predictions

```bash
curl -s "https://v3.football.api-sports.io/predictions?fixture={fixture_id}" \
  -H "x-apisports-key: ${API_SPORTS_KEY}"
```

Returns algorithmic predictions (Poisson-based) and comparative team stats.

### Soccer Analysis Patterns

**Goals per 90 minutes:**
```python
goals_per_90 = goals_total / (minutes / 90)
```

**Shots per 90:**
```python
shots_per_90 = shots_total / (minutes / 90)
```

**Shot conversion rate:**
```python
conversion_rate = goals_total / shots_total
```

**Key passes per 90:**
```python
key_passes_per_90 = passes_key / (minutes / 90)
```

Use these per-90 metrics when evaluating anytime goalscorer props, shots O/U, and assists O/U.

---

## Analysis Patterns

When analyzing player props or team bets, write Python code to calculate statistics.

### Hit Rate Calculation

For prop bets like "Tyrese Maxey over 26.5 points":

```python
import json
import os
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

Analyzing performance against a specific opponent requires a two-step process:
1. Fetch player stats to get game IDs
2. Fetch game metadata to determine the actual opponent for each game
3. Join the data before filtering by opponent

**Important:** In the player statistics response, `team` refers to the player's own team, not the opponent. You must look up game details to determine who the opponent was.

```python
def fetch_game_metadata(game_ids: list, sport: str = "nba") -> dict:
    """
    Fetch game metadata to determine home/away teams.
    Returns: {game_id: {"home_team_id": int, "away_team_id": int}}
    """
    base_urls = {
        "nba": "https://v2.nba.api-sports.io",
        "nfl": "https://v1.american-football.api-sports.io",
        "mlb": "https://v1.baseball.api-sports.io",
        "nhl": "https://v1.hockey.api-sports.io",
        "soccer": "https://v3.football.api-sports.io",
    }
    base = base_urls.get(sport, base_urls["nba"])
    metadata = {}

    for game_id in game_ids:
        result = subprocess.run([
            "curl", "-s", f"{base}/games?id={game_id}",
            "-H", f"x-apisports-key: {os.environ['API_SPORTS_KEY']}"
        ], capture_output=True, text=True)
        data = json.loads(result.stdout)
        if data.get("response"):
            game = data["response"][0]
            metadata[game_id] = {
                "home_team_id": game.get("teams", {}).get("home", {}).get("id"),
                "away_team_id": game.get("teams", {}).get("away", {}).get("id"),
            }
    return metadata


def analyze_vs_team(games: list, game_metadata: dict, opponent_team_id: int, stat: str) -> dict:
    """
    Analyze player performance against a specific team.

    Args:
        games: Player's game-by-game stats (from /players/statistics)
        game_metadata: Dict mapping game_id -> {home_team_id, away_team_id}
        opponent_team_id: Team ID to filter against
        stat: Stat field to analyze (e.g., 'points', 'yards')
    """
    def get_opponent_id(game):
        game_id = game.get("game", {}).get("id")
        meta = game_metadata.get(game_id, {})
        player_team_id = game.get("team", {}).get("id")
        # If player's team is home, opponent is away (and vice versa)
        if meta.get("home_team_id") == player_team_id:
            return meta.get("away_team_id")
        return meta.get("home_team_id")

    vs_team = [g for g in games if get_opponent_id(g) == opponent_team_id]
    vs_others = [g for g in games if get_opponent_id(g) != opponent_team_id]

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

**Usage example:**
```python
# Step 1: Fetch player stats
games = fetch_player_stats(player_id=265, season=2024)

# Step 2: Extract game IDs and fetch metadata
game_ids = [g.get("game", {}).get("id") for g in games if g.get("game", {}).get("id")]
game_metadata = fetch_game_metadata(game_ids, sport="nba")

# Step 3: Analyze vs specific opponent
result = analyze_vs_team(games, game_metadata, opponent_team_id=20, stat="points")
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

| Tool | Priority | Use For |
|------|----------|---------|
| **nba-advanced-stats** | PRIMARY for NBA | All NBA stats — bulk season averages, game logs, advanced metrics, pace, usage |
| **api-sports** | PRIMARY for NFL/MLB/NHL/Soccer, FALLBACK for NBA | Multi-sport stats; NBA fallback if nba_api fails |
| **odds-api** | — | Current lines, odds comparison, line movement |
| **Web search** | LAST RESORT | Injury reports, news, fallback stats |
