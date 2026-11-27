import { chromium } from 'playwright';
const want = process.argv[2]; const b = await chromium.launch(); const p = await b.newPage();
for (let i = 0; i < 15; i++) { await p.goto('http://localhost:3000/login'); await p.waitForSelector('.auth-card h2');
  if (await p.textContent('.auth-card h2') === want) { console.log(`saw "${want}" after ${i} reloads`); await b.close(); process.exit(0); }
  await p.waitForTimeout(3000); }
console.log(`never saw "${want}"`); await b.close(); process.exit(1);
