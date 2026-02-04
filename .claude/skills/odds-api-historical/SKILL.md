---
name: odds-api-historical
description: Query historical betting odds snapshots from The Odds API
---

# The Odds API - Historical Data

The `ODDS_API_KEY` environment variable is available. Use it with curl to fetch historical odds data.

## Overview

- Historical data available from June 2020 (featured markets), May 2023 (additional markets)
- Snapshots captured at 5-10 minute intervals
- **Quota cost**: 10 per region per market (higher than live odds)

## Endpoints

### Historical Odds for a Sport

```bash
curl -s "https://api.the-odds-api.com/v4/historical/sports/{sport_key}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&date=2024-01-15T18:00:00Z&oddsFormat=american"
```

### Historical Odds for a Specific Event

```bash
curl -s "https://api.the-odds-api.com/v4/historical/sports/{sport_key}/events/{event_id}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads&date=2024-01-15T18:00:00Z&oddsFormat=american"
```

## Required Parameters

| Param | Description |
|-------|-------------|
| `date` | ISO 8601 timestamp. Returns the closest snapshot ≤ this date |
| `regions` | `us`, `us2`, `uk`, `eu`, `au` (comma-separated) |
| `markets` | `h2h`, `spreads`, `totals`, etc. (comma-separated) |
| `oddsFormat` | `american` or `decimal` |
| `apiKey` | Your API key |

## Response Structure

```json
{
  "timestamp": "2024-01-15T17:55:00Z",
  "previous_timestamp": "2024-01-15T17:50:00Z",
  "next_timestamp": "2024-01-15T18:00:00Z",
  "data": [
    {
      "id": "event-uuid",
      "sport_key": "basketball_nba",
      "commence_time": "2024-01-15T19:00:00Z",
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
                { "name": "Los Angeles Lakers", "price": -145 },
                { "name": "Boston Celtics", "price": +125 }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

The response includes `previous_timestamp` and `next_timestamp` for navigating between snapshots.

## Historical Data Availability

| Sport | Earliest Date |
|-------|---------------|
| `basketball_nba` | June 2020 |
| `americanfootball_nfl` | June 2020 |
| `baseball_mlb` | June 2020 |
| `icehockey_nhl` | June 2020 |
| `soccer_epl` | June 2020 |
| `basketball_ncaab` | November 2020 |
| `americanfootball_ncaaf` | August 2020 |

## Example Requests

### NFL Game Odds from Last Week

```bash
curl -s "https://api.the-odds-api.com/v4/historical/sports/americanfootball_nfl/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&date=2024-01-07T18:00:00Z&oddsFormat=american"
```

### NBA Opening Lines (morning of game day)

```bash
curl -s "https://api.the-odds-api.com/v4/historical/sports/basketball_nba/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads&date=2024-01-15T12:00:00Z&oddsFormat=american"
```

### EPL Match Odds 24 Hours Before Kickoff

```bash
curl -s "https://api.the-odds-api.com/v4/historical/sports/soccer_epl/odds/?apiKey=${ODDS_API_KEY}&regions=uk&markets=h2h&date=2024-01-14T15:00:00Z&oddsFormat=decimal"
```

## Efficient Querying Tips

1. **Use event-level endpoint** when you know the specific event ID to reduce data returned
2. **Request only needed markets** - each market costs quota
3. **Navigate with timestamps** - use `previous_timestamp`/`next_timestamp` from response to walk through time
4. **Cache responses** - historical data doesn't change, so cache aggressively

## Common Use Cases

- **Line movement analysis**: Compare opening odds to closing odds
- **Sharp money detection**: Track how odds moved before game time
- **Backtesting strategies**: Test betting systems against historical odds
- **Closing line value**: Compare your bet price to final closing line
