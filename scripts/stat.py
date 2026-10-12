"""Sum a user's GitHub contributions over every year since the account opened."""
from __future__ import annotations

import datetime
import json
import urllib.request

API = "https://api.github.com/graphql"


class StatError(Exception):
    pass


def query(login: str, first_year: int, last_year: int) -> str:
    years = "".join(
        f'y{y}:contributionsCollection(from:"{y}-01-01T00:00:00Z",to:"{y}-12-31T23:59:59Z")'
        "{contributionCalendar{totalContributions}}"
        for y in range(first_year, last_year + 1)
    )
    return f'{{user(login:"{login}"){{{years}}}}}'


def total(payload: dict) -> int:
    if payload.get("errors"):
        raise StatError("GitHub API error: " + payload["errors"][0].get("message", "unknown"))
    user = (payload.get("data") or {}).get("user")
    if not user:
        raise StatError("GitHub API returned no user")
    count = 0
    for alias, collection in user.items():
        if not collection:
            raise StatError(f"GitHub API returned no data for {alias}")
        count += collection["contributionCalendar"]["totalContributions"]
    return count


def fetch(token: str, login: str = "achiurizo", first_year: int = 2008, last_year: int | None = None) -> int:
    if last_year is None:
        last_year = datetime.datetime.now(datetime.timezone.utc).year
    body = json.dumps({"query": query(login, first_year, last_year)}).encode()
    request = urllib.request.Request(API, data=body, headers={
        "Authorization": f"bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "achiurizo-profile-header",
    })
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return total(json.load(response))
    except OSError as error:
        raise StatError(f"GitHub API request failed: {error}") from error
