const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
// Uygulama internetsiz çalışmalı: dış adreslere giden her istek engellenir.
const route = (page) => page.context().route(/^https?:\/\/(?!localhost)/, r => r.abort());
(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }); const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await route(page);
  await page.goto('http://localhost:8080/index.html');
  await page.waitForTimeout(800);
  await page.click('button[data-tab="katalog"]');
  await page.fill('#supName', 'ECA');
  await page.setInputFiles('#docFile', require('path').join(__dirname, 'katalog.pdf'));
  await page.click('button[data-act="read"]');
  await page.waitForSelector('text=Kontrol:', { timeout: 120000 });
  const msg = await page.textContent('#view .card:nth-of-type(2) .muted');
  console.log('DRAFT:', msg);
  await page.click('button[data-act="save"]');
  await page.waitForTimeout(500);
  await page.click('button[data-tab="ara"]');
  await page.waitForTimeout(1200);
  const cards = await page.$$eval('.pcard', els => els.map(e => ({ name: e.querySelector('b').textContent, img: !!e.querySelector('.thumb img'), price: (e.querySelector('.price')||{}).textContent })));
  console.log('CARDS:', JSON.stringify(cards));
  await page.screenshot({ path: require('path').join(__dirname, 'ara.png') });
  await page.click('.pcard >> nth=0');
  await page.waitForTimeout(1000);
  const variants = await page.$$eval('.chip', els => els.map(e => e.textContent));
  console.log('VARIANTS:', JSON.stringify(variants));
  await page.screenshot({ path: require('path').join(__dirname, 'urun.png') });
  // Alt bar ürün sayfasında da görünür ve seçili sekme işaretlidir
  const navOn = await page.$eval('nav.tabs button.on', e => e.dataset.tab);
  console.log('NAV:', navOn, await page.isVisible('nav.tabs'));
  // Ayarlar: deneyim puanı ve sürüm testi kaydedilir
  await page.click('nav button[data-tab="ayar"]');
  await page.click('[data-act="toggle"][data-id="vt"]');
  await page.click('[data-act="vmark"][data-id="k1:ok"]');
  const vt = await page.evaluate(() => JSON.parse(localStorage.getItem('klavuz.v1')).vtest.marks.k1);
  console.log('VTEST:', vt);
  if (!cards.length || navOn !== 'ara' || vt !== 'ok' || errors.length) { console.log('ERRORS:', JSON.stringify(errors)); throw new Error('uçtan uca test başarısız'); }
  console.log('ERRORS:', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
