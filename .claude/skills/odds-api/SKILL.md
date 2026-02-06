---
name: odds-api
description: Fetch live sports betting odds from The Odds API
---

# The Odds API

The `ODDS_API_KEY` environment variable is available. Use it with curl to fetch data.

## Efficient Querying

API quota costs 1 per market per region requested. To minimize usage:

- Only request needed markets (don't request `spreads` if you only need moneyline)
- Use `bookmakers` param to filter to specific sportsbooks
- Limit regions to what's relevant (`us` for US sports, `uk` for EPL)
- Use `eventIds` param to fetch specific games instead of all

## Sport Keys

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

| Market | Description |
|--------|-------------|
| `player_points` | Player points (NBA) |
| `player_rebounds` | Player rebounds (NBA) |
| `player_assists` | Player assists (NBA) |
| `player_threes` | Player 3-pointers (NBA) |
| `player_pass_yds` | Player passing yards (NFL) |
| `player_rush_yds` | Player rushing yards (NFL) |
| `player_reception_yds` | Player receiving yards (NFL) |
| `pitcher_strikeouts` | Pitcher strikeouts (MLB) |
| `batter_total_bases` | Batter total bases (MLB) |

## API Endpoints

### List Available Sports

```bash
curl -s "https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}"
```

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

**NEVER debug credentials when you get empty results.** Adjust your query parameters instead.
