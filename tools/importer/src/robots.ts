/**
 * A small robots.txt reader: the rules for all crawlers (`User-agent: *`), with the longest
 * matching rule deciding and `Allow` winning a tie. Enough for a hand-picked list of pages.
 */
export interface RobotsRules {
  allows: (pathAndQuery: string) => boolean;
}

export function parseRobots(text: string): RobotsRules {
  const rules: { allow: boolean; prefix: string }[] = [];
  let applies = false;
  let inAgents = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      // Consecutive User-agent lines share one group of rules.
      if (!inAgents) applies = false;
      inAgents = true;
      if (value === '*') applies = true;
      continue;
    }
    inAgents = false;
    if (!applies || (field !== 'allow' && field !== 'disallow')) continue;
    if (value) rules.push({ allow: field === 'allow', prefix: value });
  }
  return {
    allows(pathAndQuery) {
      let best: { allow: boolean; prefix: string } | null = null;
      for (const rule of rules) {
        if (!pathAndQuery.startsWith(rule.prefix)) continue;
        if (
          !best ||
          rule.prefix.length > best.prefix.length ||
          (rule.prefix.length === best.prefix.length && rule.allow)
        ) {
          best = rule;
        }
      }
      return best ? best.allow : true;
    },
  };
}
