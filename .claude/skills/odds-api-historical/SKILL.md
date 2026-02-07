---
name: odds-api-historical
description: Query historical betting odds snapshots from The Odds API
---

# The Odds API - Historical Data

The `ODDS_API_KEY` environment variable is available. Use it with curl to fetch historical odds data.

**Important:** Always source the environment file before API calls to ensure variables are loaded:
```bash
source /vercel/sandbox/.agent-env.sh 2>/dev/null || true
```

## Critical: Query Time Strategy

**The historical endpoint only returns games that haven't started yet at the snapshot time.** This is the most common source of "missing games" issues.

**Default behavior - ALWAYS follow this:**
- **Use 10:00 AM ET (15:00 UTC)** as the snapshot time when querying a full day's games
- This ensures all games are captured before any start (earliest NBA/NFL games are ~12 PM ET)
- Only use later timestamps when specifically requesting "closing odds" for a particular game

**Why this matters:**
- Query at 6:55 PM ET → afternoon games (1 PM, 3 PM starts) are **excluded** because they've commenced
- Query at 10:00 AM ET → **all games** for that day are included

## Full Day Historical Query

When fetching historical odds for an entire day:

1. **Convert the date to 10:00 AM ET (15:00 UTC)** on the target date
2. Query with that timestamp to get all games scheduled for that day
3. If user wants closing odds: make a second query at 11:00 PM ET (04:00 UTC next day) and merge results

**Example: All NBA games on Feb 2, 2025**
```bash
# Use 10 AM ET (15:00 UTC) to capture all games before any start
curl -s "https://api.the-odds-api.com/v4/historical/sports/basketball_nba/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&date=2025-02-02T15:00:00Z&oddsFormat=american"
```

## Closing Odds Query

**For closing odds of a specific game:**
- Query 30-60 minutes before its `commence_time`
- Example: Game at 7:00 PM ET → query at 6:30 PM ET (23:30 UTC)

**For closing odds of all games on a day:**
- Late games: Query at 11:00 PM ET (04:00 UTC next day)
- Early games: Query individually using their `commence_time`
- **Note**: A single late-night query will miss early games that already started

**Full day closing odds workflow:**
1. Query at 10:00 AM ET to get the list of all games with their `commence_time` values
2. For each game, query 30-60 min before its `commence_time` to get closing odds
3. Or accept that a single late query captures late games only

## Overview

- Historical data available from June 2020 (featured markets), May 2023 (additional markets)
- Snapshots captured at 5-10 minute intervals
- **Quota cost**: 10 per region per market (higher than live odds)

## Endpoints

### Historical Odds for a Sport

```bash
# Use 10 AM ET (15:00 UTC) to capture all games before any start
curl -s "https://api.the-odds-api.com/v4/historical/sports/{sport_key}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&date=2024-01-15T15:00:00Z&oddsFormat=american"
```

### Historical Odds for a Specific Event

```bash
# For event-specific queries, use 30-60 min before commence_time for closing odds
curl -s "https://api.the-odds-api.com/v4/historical/sports/{sport_key}/events/{event_id}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads&date=2024-01-15T23:30:00Z&oddsFormat=american"
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

### All NFL Games on a Sunday (full slate)

```bash
# Use 10 AM ET (15:00 UTC) to capture all games before any start
curl -s "https://api.the-odds-api.com/v4/historical/sports/americanfootball_nfl/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&date=2024-01-07T15:00:00Z&oddsFormat=american"
```

### All NBA Games on a Day (opening lines)

```bash
# Use 10 AM ET (15:00 UTC) to get all games including early afternoon tips
curl -s "https://api.the-odds-api.com/v4/historical/sports/basketball_nba/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads&date=2024-01-15T15:00:00Z&oddsFormat=american"
```

### EPL Match Odds (all Saturday fixtures)

```bash
# Use 10 AM UK time (10:00 UTC) for Premier League - earliest kickoffs are 12:30 PM UK
curl -s "https://api.the-odds-api.com/v4/historical/sports/soccer_epl/odds/?apiKey=${ODDS_API_KEY}&regions=uk&markets=h2h&date=2024-01-14T10:00:00Z&oddsFormat=decimal"
```

### Closing Odds for a Specific Game

```bash
# For a game at 7:00 PM ET (00:00 UTC next day), query 30 min before
curl -s "https://api.the-odds-api.com/v4/historical/sports/basketball_nba/events/{event_id}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads&date=2024-01-15T23:30:00Z&oddsFormat=american"
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
