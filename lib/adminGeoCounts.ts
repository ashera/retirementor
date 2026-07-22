import "server-only";
import { query } from "./db";

export interface CountryCount {
  country: string; // 2-letter ISO
  users: number;
  visitors: number;
}

/** Per-country tallies of signed-up accounts and anonymous visitors, for the admin
 *  map. Only rows with a resolved country are counted. */
export async function getLocationCounts(): Promise<CountryCount[]> {
  const [u, v] = await Promise.all([
    query<{ country: string; n: number }>(
      "select country, count(*)::int as n from users where country is not null group by country",
    ),
    query<{ country: string; n: number }>(
      "select country, count(*)::int as n from visitors where country is not null group by country",
    ),
  ]);

  const map = new Map<string, CountryCount>();
  const bump = (country: string, key: "users" | "visitors", n: number) => {
    const row = map.get(country) ?? { country, users: 0, visitors: 0 };
    row[key] += n;
    map.set(country, row);
  };
  for (const r of u.rows) bump(r.country, "users", r.n);
  for (const r of v.rows) bump(r.country, "visitors", r.n);

  return [...map.values()].sort((a, b) => b.users + b.visitors - (a.users + a.visitors));
}
