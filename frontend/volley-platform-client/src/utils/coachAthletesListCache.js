/** Short in-memory cache so Back from athlete profile does not refetch ~142 rows. */

const TTL_MS = 90_000;

let cache = null;

export function getCoachAthletesListCache() {
  if (!cache) return null;
  if (Date.now() - cache.at > TTL_MS) {
    cache = null;
    return null;
  }
  return cache;
}

export function setCoachAthletesListCache({ athletes, teams, cardIndexes, clubCoaches }) {
  cache = {
    athletes: Array.isArray(athletes) ? athletes : [],
    teams: Array.isArray(teams) ? teams : [],
    cardIndexes: Array.isArray(cardIndexes) ? cardIndexes : [],
    clubCoaches: Array.isArray(clubCoaches) ? clubCoaches : [],
    at: Date.now(),
  };
}

export function invalidateCoachAthletesListCache() {
  cache = null;
}
