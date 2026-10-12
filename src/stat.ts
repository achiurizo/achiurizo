// Sum a user's GitHub contributions over every year since the account opened.
const API = "https://api.github.com/graphql";

export class StatError extends Error {}

// The API caps one contributionsCollection at one year, so the query holds one
// aliased collection per year.
export function query(login: string, firstYear: number, lastYear: number): string {
  let years = "";
  for (let y = firstYear; y <= lastYear; y++) {
    years += `y${y}:contributionsCollection(from:"${y}-01-01T00:00:00Z",to:"${y}-12-31T23:59:59Z"){contributionCalendar{totalContributions}}`;
  }
  return `{user(login:"${login}"){${years}}}`;
}

export function total(payload: any): number {
  try {
    return sum(payload);
  } catch (error) {
    if (error instanceof StatError) throw error;
    throw new StatError(`GitHub API answer has an unexpected shape: ${(error as Error).message}`);
  }
}

function sum(payload: any): number {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new TypeError("answer is not an object");
  if (Array.isArray(payload.errors) && payload.errors.length) {
    throw new StatError("GitHub API error: " + String(payload.errors[0].message ?? "unknown"));
  }
  const user = payload.data?.user;
  if (!user) throw new StatError("GitHub API returned no user");
  if (typeof user !== "object") throw new TypeError("user is not an object");
  let count = 0;
  for (const [alias, collection] of Object.entries<any>(user)) {
    if (!collection) throw new StatError(`GitHub API returned no data for ${alias}`);
    const year = collection.contributionCalendar.totalContributions;
    if (!Number.isInteger(year)) throw new TypeError(`${alias} total is ${JSON.stringify(year)}`);
    count += year;
  }
  return count;
}

export async function fetchTotal(token: string, login = "achiurizo", firstYear = 2008, lastYear = new Date().getUTCFullYear()): Promise<number> {
  let payload: unknown;
  try {
    const response = await fetch(API, {
      method: "POST",
      headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "achiurizo-profile-header" },
      body: JSON.stringify({ query: query(login, firstYear, lastYear) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    payload = await response.json();
  } catch (error) {
    throw new StatError(`GitHub API request failed: ${(error as Error).message}`);
  }
  return total(payload);
}
