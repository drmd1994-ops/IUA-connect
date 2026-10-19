// The check after each deploy of the hosted demo (M18 plan §6):
//
//   pnpm smoke:hosted
//
// Without a password: the site answers, the server is ready, the site reaches the server, a
// calculator page loads, and sign-in answers (with an address that has no account, so nobody's
// account counts a failed attempt). With SMOKE_PASSWORD set in the shell (the demo password; it is
// read from the environment only and never printed), it also signs in as member.full@demo.test
// and waits for the live chat stream's first event.
const SITE = process.env.SMOKE_SITE ?? 'https://web-production-3a424c.up.railway.app';
const API = process.env.SMOKE_API ?? 'https://api-production-81c9.up.railway.app';

let failures = 0;
async function check(name, run) {
  try {
    await run();
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  ✖ ${name}: ${error.message}`);
  }
}

async function expectStatus(url, status, init) {
  const res = await fetch(url, { redirect: 'manual', ...init });
  if (res.status !== status) throw new Error(`${url} answered ${res.status}, not ${status}`);
  return res;
}

const login = (email, password) =>
  fetch(`${SITE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

console.log(`Checking ${SITE} and ${API}`);
await check('the site answers in Hebrew', () => expectStatus(`${SITE}/he`, 200));
await check('the server is ready', () => expectStatus(`${API}/health/ready`, 200));
await check('the site reaches the server (news)', async () => {
  const res = await expectStatus(`${SITE}/api/v1/news`, 200);
  const body = await res.json();
  if (!Array.isArray(body.items) || body.items.length === 0) throw new Error('no news items');
});
await check('a calculator page loads', () => expectStatus(`${SITE}/he/calculators/egfr`, 200));
await check('sign-in answers, and refuses a wrong one', async () => {
  const res = await login('nobody.smoke@demo.test', 'not the password at all');
  if (res.status !== 401) throw new Error(`answered ${res.status}, not 401`);
});

const password = process.env.SMOKE_PASSWORD;
if (password) {
  let token;
  await check('a demo member signs in', async () => {
    const res = await login('member.full@demo.test', password);
    if (res.status !== 200) throw new Error(`answered ${res.status}`);
    token = (await res.json()).accessToken;
    if (!token) throw new Error('no access token');
  });
  if (token) {
    await check('the live chat stream delivers its first event', async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 40_000);
      try {
        const res = await fetch(`${API}/api/v1/chat/stream`, {
          headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (res.status !== 200) throw new Error(`answered ${res.status}`);
        const reader = res.body.getReader();
        const { value } = await reader.read();
        if (!value?.length) throw new Error('the stream closed without an event');
        await reader.cancel();
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    });
  }
} else {
  console.log('  - sign-in and live chat not checked (SMOKE_PASSWORD not set)');
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
