---
name: odds-api
description: Fetch live sports betting odds from The Odds API
---

# The Odds API

The `ODDS_API_KEY` environment variable is available. Use it with curl to fetch data.

**Important:** Read the API key from config before API calls:
```bash
ODDS_API_KEY=$(grep '^ODDS_API_KEY=' /vercel/sandbox/.agent-env | cut -d'=' -f2-)
```

## Efficient Querying

API quota costs 1 per market per region requested. To minimize usage:

- Only request needed markets (don't request `spreads` if you only need moneyline)
- Use `bookmakers` param to filter to specific sportsbooks
- Limit regions to what's relevant (`us` for US sports, `uk` for EPL)
- Use `eventIds` param to fetch specific games instead of all

## Rate Limiting

The API rate limit is 30 requests per second. To avoid 429 errors:

- **Combine markets in a single request** — use `markets=h2h,spreads,totals` instead of separate requests per market. Same applies to regions.
- **Cache `/sports` and `/events` responses** — these don't change often. Reuse results within a session instead of re-fetching.
- **Space sequential requests** — when looping through multiple events, add a brief pause between calls rather than firing them all at once.
- **Reduce frequency for empty results** — if a sport is off-season or no events are listed, don't keep polling.
- **Retry on 429** — if you get a 429 status code, wait 2-3 seconds and retry. Do not retry immediately.

## Sport Keys

> **These tables list common keys only** — the API adds and removes sport keys seasonally.
> **Championship and playoff games** (Super Bowl, NBA Finals, World Series, Stanley Cup) are listed under the main sport key (e.g., `americanfootball_nfl`), not separate keys like `americanfootball_nfl_super_bowl`.
> When unsure, query `/v4/sports/` first — **this endpoint is free** and costs zero quota.

### US Sports

| Key | Sport |
|-----|-------|
| `basketball_nba` | NBA |
| `basketball_ncaab` | NCAA Basketball |
| `basketball_wnba` | WNBA |
| `americanfootball_nfl` | NFL |
| `americanfootball_ncaaf` | NCAA Football |
| `baseball_mlb` | MLB |
| `icehockey_nhl` | NHL |
| `mma_mixed_martial_arts` | MMA/UFC |

### Soccer

| Key | League |
|-----|--------|
| `soccer_epl` | English Premier League |
| `soccer_spain_la_liga` | La Liga |
| `soccer_germany_bundesliga` | Bundesliga |
| `soccer_italy_serie_a` | Serie A |
| `soccer_france_ligue_one` | Ligue 1 |
| `soccer_usa_mls` | MLS |
| `soccer_mexico_ligamx` | Liga MX |
| `soccer_uefa_champs_league` | Champions League |

### Other

| Key | Sport |
|-----|-------|
| `golf_pga_championship` | PGA Golf |
| `tennis_atp_aus_open` | ATP Tennis |
| `boxing_boxing` | Boxing |

## Markets Reference

### Featured Markets (most common)

| Market | Description |
|--------|-------------|
| `h2h` | Moneyline / head-to-head winner |
| `spreads` | Point spreads / handicaps |
| `totals` | Over/under game totals |
| `outrights` | Futures / championship winner |

### Additional Markets

| Market | Description |
|--------|-------------|
| `alternate_spreads` | Alternate point spreads |
| `alternate_totals` | Alternate over/unders |
| `btts` | Both teams to score (soccer) |
| `draw_no_bet` | Draw no bet (soccer) |
| `team_totals` | Individual team totals |

### Period Markets

| Market | Description |
|--------|-------------|
| `h2h_q1` | First quarter moneyline |
| `h2h_h1` | First half moneyline |
| `spreads_q1` | First quarter spread |
| `spreads_h1` | First half spread |
| `totals_q1` | First quarter total |
| `totals_h1` | First half total |

### Player Props

> **Player prop markets must be queried via the per-event endpoint (`/events/{id}/odds`), not the sport-level endpoint (`/odds`).** The sport-level endpoint returns `INVALID_MARKET` for player props. Always fetch the events list first, then loop through event IDs to get props.

| Market | Description |
|--------|-------------|
| `player_points` | Player points (NBA) |
| `player_rebounds` | Player rebounds (NBA) |
| `player_threes` | Player 3-pointers (NBA) |
| `player_pass_yds` | Player passing yards (NFL) |
| `player_rush_yds` | Player rushing yards (NFL) |
| `player_reception_yds` | Player receiving yards (NFL) |
| `pitcher_strikeouts` | Pitcher strikeouts (MLB) |
| `batter_total_bases` | Batter total bases (MLB) |
| `player_goal_scorer_anytime` | Anytime goalscorer (Soccer) |
| `player_first_goal_scorer` | First goalscorer (Soccer) |
| `player_shots` | Player total shots O/U (Soccer) |
| `player_assists` | Player assists O/U (NBA + Soccer — same key, disambiguated by sport event) |
| `player_fouls` | Player fouls committed O/U (Soccer — variable coverage) |
| `player_tackles` | Player tackles O/U (Soccer — variable coverage) |
| `player_blocks` | Player blocks O/U (Soccer — variable coverage) |
| `player_pass_attempts` | Player pass attempts O/U (Soccer — variable coverage) |

## API Endpoints

### List Available Sports

```bash
curl -s "https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}"
```

### List Events for a Sport

```bash
curl -s "https://api.the-odds-api.com/v4/sports/{sport_key}/events/?apiKey=${ODDS_API_KEY}"
```

**Free** — does not count against quota. Returns event IDs, teams, and commence times. Use this to find a specific game (e.g., the Super Bowl) by its `eventId`, then query odds for just that event.

**Parameters:**

| Param | Values | Description |
|-------|--------|-------------|
| `commenceTimeFrom` | ISO 8601 | Filter events starting after this time |
| `commenceTimeTo` | ISO 8601 | Filter events starting before this time |

### List Available Markets for an Event

```bash
curl -s "https://api.the-odds-api.com/v4/sports/{sport_key}/events/{event_id}/markets/?apiKey=${ODDS_API_KEY}"
```

Costs **1 quota credit**. Returns which market keys each bookmaker offers for a specific event. Useful when you're unsure which player props or alternate markets are available before requesting odds.

### Get Odds for a Sport

```bash
curl -s "https://api.the-odds-api.com/v4/sports/{sport_key}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american"
```

**Parameters:**

| Param | Values | Description |
|-------|--------|-------------|
| `regions` | `us`, `us2`, `uk`, `eu`, `au` | Comma-separated regions |
| `markets` | `h2h`, `spreads`, `totals`, etc. | Comma-separated markets |
| `oddsFormat` | `american`, `decimal` | Odds display format |
| `bookmakers` | `draftkings`, `fanduel`, etc. | Filter to specific books |
| `eventIds` | UUID | Fetch specific events only |

### Get Odds for a Specific Event

```bash
curl -s "https://api.the-odds-api.com/v4/sports/{sport_key}/events/{event_id}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american"
```

### Get Scores (Live & Recent)

```bash
curl -s "https://api.the-odds-api.com/v4/sports/{sport_key}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=1"
```

**Parameters:**

| Param | Values | Description |
|-------|--------|-------------|
| `daysFrom` | 1-3 | Include completed games from past N days |

## Response Structure

```json
{
  "id": "event-uuid",
  "sport_key": "basketball_nba",
  "sport_title": "NBA",
  "commence_time": "2024-01-15T00:00:00Z",
  "home_team": "Los Angeles Lakers",
  "away_team": "Boston Celtics",
  "bookmakers": [
    {
      "key": "draftkings",
      "title": "DraftKings",
      "markets": [
        {
          "key": "h2h",
          "outcomes": [
            { "name": "Los Angeles Lakers", "price": -150 },
            { "name": "Boston Celtics", "price": +130 }
          ]
        }
      ]
    }
  ]
}
```

## Best Practices

1. **Compare odds across sportsbooks** - Look for the best line/price
2. **Check for line movement** - Note if odds have shifted
3. **Cite your sources** - Always mention which sportsbooks you're quoting
4. **Explain the odds** - American odds format: +150 means $100 wins $150, -150 means bet $150 to win $100

## Troubleshooting

### Empty results from an API call

Empty results (`[]`) mean the requested market does not exist for that event. This is normal, NOT a credential issue.

**Common causes:** off-season (no events), wrong market type for the game stage (e.g., `outrights` after a championship matchup is set — use `h2h,spreads,totals` instead), or invalid `eventId`.

Empty results are not a credential issue — adjust your query parameters instead.

### Unknown sport key / 404 error

**Cause:** Fabricated or guessed sport key (e.g., `americanfootball_nfl_super_bowl`). The API only accepts keys it currently lists.

**Fix:** Query `/v4/sports/` first to get valid keys — it's free and costs zero quota.

**Key rule:** Championship and playoff games (Super Bowl, NBA Finals, World Series, Stanley Cup) always use the main sport key (e.g., `americanfootball_nfl`), never a special one. Find the specific game by querying `/v4/sports/{sport_key}/events/` (also free).
