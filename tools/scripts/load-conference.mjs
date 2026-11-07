#!/usr/bin/env node
/**
 * The hall, from one address (M32 plan §6): guests come in through the guest entry, each opens the
 * live stream, and all of them vote within seconds.
 *
 *   node tools/scripts/load-conference.mjs --base <server> --slug <event> --code <guest code>
 *     --session <session id> [--people 300] [--arrive 300] [--hold 60] [--vote-within 20]
 *
 * A poll of the session must be open. It uses only Node. On the hosted demo it costs a little and
 * makes the demo slow while it runs, so it is run only with the owner's agreement. The guests it
 * makes stay until "Start the demonstration" is pressed again.
 */
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .flatMap((arg, index, all) => (arg.startsWith('--') ? [[arg.slice(2), all[index + 1]]] : [])),
);
for (const name of ['base', 'slug', 'code', 'session']) {
  if (!args[name]) {
    console.error(`Missing --${name}`);
    process.exit(2);
  }
}
const base = args.base.replace(/\/$/, '');
const people = Number(args.people ?? 300);
const arriveSec = Number(args.arrive ?? 300);
const holdSec = Number(args.hold ?? 60);
const voteWithinSec = Number(args['vote-within'] ?? 20);
const event = `${base}/api/v1/events/${encodeURIComponent(args.slug)}`;
const session = `${event}/sessions/${args.session}`;

const refused = new Map();
const failed = new Map();
const timings = { enter: [], vote: [], live: [], read: [] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function note(where, status) {
  if (status === 429) refused.set(where, (refused.get(where) ?? 0) + 1);
  else failed.set(`${where} ${status}`, (failed.get(`${where} ${status}`) ?? 0) + 1);
}

function percentile(list, share) {
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]);
}

async function enter(person) {
  const started = performance.now();
  const response = await fetch(`${event}/guest-entry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: args.code, client: 'app', deviceName: 'load test' }),
  });
  if (!response.ok) {
    note('enter', response.status);
    return;
  }
  timings.enter.push(performance.now() - started);
  person.token = (await response.json()).accessToken;
}

/** Holds the stream, and notes when the first change of a poll reaches this person. */
function listen(person, controller) {
  return fetch(`${event}/live/stream`, {
    headers: { Accept: 'text/event-stream', Authorization: `Bearer ${person.token}` },
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok || !response.body) {
        note('stream', response.status);
        return;
      }
      person.listening = true;
      const decoder = new TextDecoder();
      for await (const chunk of response.body) {
        const text = decoder.decode(chunk);
        if (text.includes('"polls"')) void askAgain(person);
        if (text.includes('"polls"') && voteStart && person.heard === undefined) {
          person.heard = performance.now();
          timings.live.push(person.heard - voteStart);
        }
      }
    })
    .catch(() => undefined);
}

let voteStart = 0;

/** What a phone does on hearing of a change: asks again, at a random moment within 1.5 seconds. */
async function askAgain(person) {
  await sleep(Math.random() * 1500);
  const started = performance.now();
  const response = await fetch(`${session}/live`, {
    headers: { Authorization: `Bearer ${person.token}` },
  }).catch(() => null);
  if (!response) return;
  await response.text();
  if (response.ok) timings.read.push(performance.now() - started);
  else note('read', response.status);
}

async function vote(person, poll) {
  const option = poll.options[Math.floor(Math.random() * poll.options.length)];
  const started = performance.now();
  const response = await fetch(`${session}/polls/${poll.id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${person.token}` },
    body: JSON.stringify({ optionId: option.id }),
  });
  if (!response.ok) {
    note('vote', response.status);
    return;
  }
  timings.vote.push(performance.now() - started);
}

async function main() {
  const crowd = Array.from({ length: people }, () => ({}));
  const controller = new AbortController();
  console.log(`${people} people arrive over ${arriveSec} seconds, from one address.`);
  await Promise.all(
    crowd.map(async (person, index) => {
      await sleep((index / people) * arriveSec * 1000);
      await enter(person);
      if (person.token) void listen(person, controller);
    }),
  );
  const inside = crowd.filter((person) => person.token);
  console.log(`${inside.length} inside. Holding for ${holdSec} seconds.`);
  await sleep(holdSec * 1000);

  const first = inside[0];
  if (!first) throw new Error('Nobody got in.');
  const live = await fetch(`${session}/live`, {
    headers: { Authorization: `Bearer ${first.token}` },
  });
  if (!live.ok) throw new Error(`Reading the session answered ${live.status}`);
  const poll = (await live.json()).polls.find((item) => item.status === 'OPEN');
  if (!poll) throw new Error('No poll of this session is open.');

  console.log(`All vote within ${voteWithinSec} seconds.`);
  voteStart = performance.now();
  await Promise.all(
    inside.map(async (person) => {
      await sleep(Math.random() * voteWithinSec * 1000);
      await vote(person, poll);
    }),
  );
  await sleep(6000);
  controller.abort();

  const listening = inside.filter((person) => person.listening).length;
  const heard = inside.filter((person) => person.heard !== undefined).length;
  const after = await fetch(`${session}/live`, {
    headers: { Authorization: `Bearer ${first.token}` },
  })
    .then((response) => response.json())
    .catch(() => null);
  const counted = after?.polls.find((item) => item.id === poll.id)?.total ?? null;

  console.log('\nResults');
  console.log(`  In:             ${inside.length} of ${people}`);
  console.log(`  On the stream:  ${listening} of ${inside.length}`);
  console.log(`  Votes answered: ${timings.vote.length}, counted by the server: ${counted}`);
  console.log(`  Refused (429):  ${JSON.stringify(Object.fromEntries(refused))}`);
  console.log(`  Other failures: ${JSON.stringify(Object.fromEntries(failed))}`);
  console.log(`  Entry, 95 of 100 within: ${percentile(timings.enter, 0.95)} ms`);
  console.log(`  Vote, 95 of 100 within:  ${percentile(timings.vote, 0.95)} ms`);
  console.log(
    `  Reads after news: ${timings.read.length}, 95 of 100 within: ${percentile(timings.read, 0.95)} ms`,
  );
  console.log(
    `  First news reached ${heard} of ${listening} streams, all within: ${percentile(timings.live, 1)} ms`,
  );

  const voteP95 = percentile(timings.vote, 0.95);
  const passed =
    refused.size === 0 &&
    failed.size === 0 &&
    inside.length === people &&
    counted === people &&
    voteP95 !== null &&
    voteP95 <= 2000 &&
    heard === listening &&
    listening === people;
  console.log(passed ? '\nPASSED' : '\nNOT PASSED');
  process.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
