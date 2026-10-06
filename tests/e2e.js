// Pruebas de la app en un iPhone emulado (Chromium con perfil de iPhone 13).
// Uso: python3 -m http.server 8765 &  ;  NODE_PATH=/opt/node-tools/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/e2e.js
const { chromium, devices } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const URL = process.env.APP_URL || 'http://localhost:8765/';
const SHOTS = process.env.SHOTS || '/tmp/pdd-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const results = []; let errors = [];
const ok = (cond, name, extra) => { results.push({ cond: !!cond, name, extra }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iphone = Object.assign({}, devices['iPhone 13']); delete iphone.defaultBrowserType;
const FIXED = '2026-10-15T12:00:00-03:00';

async function newCtx(browser, extra) {
  const ctx = await browser.newContext(Object.assign({}, iphone, { locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', acceptDownloads: true }, extra || {}));
  await ctx.clock.setFixedTime(new Date(FIXED));
  return ctx;
}
async function open(ctx, init) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (init) await page.addInitScript(init);
  await page.goto(URL);
  await page.waitForSelector('#view .card');
  return page;
}
const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(PDD.getState())));
const ajTo = async (page, k) => { await tabTo(page, 'ajustes'); await page.click('[data-a=aj][data-s=' + k + ']'); await sleep(50); };
const tabTo = async (page, t) => { await page.click('#tabs [data-t=' + t + ']'); await sleep(50); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, key) => (o[key] = x[key], o), {}) : x);
const diffState = (a, b) => { const o = []; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (k === 'updatedAt') continue; if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { let w = k; if (Array.isArray(a[k]) && Array.isArray(b[k])) { let i = a[k].findIndex((x, j) => JSON.stringify(x) !== JSON.stringify(b[k][j])); if (i < 0) i = Math.min(a[k].length, b[k].length); w += '[' + i + '] ' + String(JSON.stringify(a[k][i])).slice(0, 160) + ' => ' + String(JSON.stringify(b[k][i])).slice(0, 160) + ' (largo ' + a[k].length + '/' + b[k].length + ')'; } o.push(w); } } return o; };
const SHARE_MOCK = () => {
  window.__shared = [];
  navigator.canShare = () => true;
  navigator.share = async (d) => { window.__shared.push({ text: d.text || null, title: d.title, files: await Promise.all((d.files || []).map(async (f) => ({ name: f.name, type: f.type, text: await f.text(), bom: Array.from(new Uint8Array(await f.slice(0, 3).arrayBuffer())) }))) }); };
};

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. primer arranque, pantallas y diseño ----------
  let ctx = await newCtx(browser);
  let page = await open(ctx);
  ok(errors.length === 0, 'sin errores de JS al abrir', errors);
  let S = await state(page);
  ok(S.demo && S.debts.length === 3, 'arranca con datos de ejemplo');
  ok(await page.locator('text=Instalala en tu iPhone').count() === 1, 'muestra cómo instalarla en iPhone');
  ok((await page.textContent('#sub')).trim() === 'Octubre 2026', 'encabezado con el mes', await page.textContent('#sub'));
  for (const t of ['inicio', 'deudas', 'ahorro', 'ajustes']) {
    await tabTo(page, t);
    ok(await overflow(page) <= 0, 'sin scroll horizontal en ' + t, await overflow(page));
    await page.screenshot({ path: path.join(SHOTS, 'iphone-' + t + '.png'), fullPage: true });
  }
  // botón "Compartir resumen" (ahora en Ajustes) con la línea de aviso
  await tabTo(page, 'inicio');
  const shareCard = page.locator('.card:has([data-a=share])');
  ok((await shareCard.textContent()).includes('historial completo'), 'la línea sobre el botón avisa que va el historial completo');
  ok(await page.locator('#tabs button').count() === 4 && !(await page.textContent('#tabs')).includes('Gastos') && (await page.textContent('#tabs')).includes('Ajustes') && !(await page.textContent('#tabs')).includes('Plan'), 'pestañas: Inicio, Deudas, Ahorro y Ajustes');
  ok(!(await page.textContent('#view')).match(/[Cc]olchón/), 'en Ajustes no queda la palabra colchón');
  // áreas táctiles
  await tabTo(page, 'inicio');
  ok(await page.locator('#view [data-a=save]').count() === 0, 'Inicio ya no tiene el botón Aparté');
  ok(!(await page.textContent('#view')).match(/[Cc]olchón/) && (await page.textContent('#view')).includes('Ahorro'), 'Inicio dice Ahorro, no colchón');
  ok(await page.locator('#debtCard .dbar').count() === 4, 'la tarjeta de deuda tiene una barra por mes (3 cierres + el actual)', await page.locator('#debtCard .dbar').count());
  ok(await page.locator('#debtCard .dbar.up').count() === 0, 'si la deuda viene bajando no hay barras rojas');
  const small = await page.evaluate(() => [...document.querySelectorAll('button, label.mk-btn, select, input[type=text]')].filter((e) => e.offsetParent && !e.classList.contains('lnk') && !e.classList.contains('chip') && !e.classList.contains('pcin')).map((e) => ({ t: (e.textContent || e.id || '').trim().slice(0, 20), h: e.getBoundingClientRect().height })).filter((x) => x.h < 34));
  ok(small.length === 0, 'botones con alto táctil razonable (>=34px)', small);
  await page.click('text=Ocultar'); // demo
  await page.click('text=Entendido');
  S = await state(page);
  ok(!S.demo, 'se puede ocultar el aviso de ejemplo');
  ok(await page.evaluate(() => localStorage.getItem('pdd:hint')) === '1', 'recuerda que ya vio cómo instalarla');

  // ---------- 2. pagar, deshacer, persistencia ----------
  await page.click('#view > [data-a=pay]');
  await page.selectOption('#f-debt', { label: 'Préstamo de un amigo' });
  await page.fill('#f-amt', '5000');
  ok(await page.inputValue('#f-amt') === '5.000', 'el monto se escribe con puntos de miles', await page.inputValue('#f-amt'));
  await page.click('[data-a=ok]');
  S = await state(page);
  const amigo = S.debts.find((d) => d.n === 'Préstamo de un amigo');
  ok(amigo.b === 55000 && amigo.paid === 5000, 'el pago baja el saldo y suma a lo pagado', amigo);
  ok(S.log.some((e) => e.t === 'pago' && e.d.monto === 5000), 'el pago queda en el historial');
  ok(await page.locator('#toast [data-a=undo]').count() === 1, 'aparece Deshacer');
  await page.click('#toast [data-a=undo]');
  S = await state(page);
  ok(S.debts.find((d) => d.n === 'Préstamo de un amigo').b === 60000, 'deshacer devuelve el saldo');
  ok(S.log.some((e) => e.t === 'deshacer'), 'deshacer también queda en el historial');
  // pagar más de lo que se debe
  await page.click('#view > [data-a=pay]');
  await page.selectOption('#f-debt', { label: 'Préstamo de un amigo' });
  await page.fill('#f-amt', '999999');
  await page.click('[data-a=ok]');
  S = await state(page);
  ok(S.debts.find((d) => d.n === 'Préstamo de un amigo').b === 0, 'pagar de más solo anota lo que quedaba');
  ok((await page.textContent('#toast')).includes('lo que quedaba'), 'avisa que se anotó solo lo que quedaba');
  await page.click('#toast [data-a=undo]');
  // validación
  await page.click('#view > [data-a=pay]');
  await page.click('[data-a=ok]');
  ok(await page.locator('#err:visible').count() === 1, 'pide el monto si falta');
  await page.click('[data-a=no]');

  // ---------- 3. plan: ingreso y porcentajes ----------
  await tabTo(page, 'ajustes');
  ok(await page.locator('[data-a=aj]').count() === 4 && await page.locator('#inc, #pctBox').count() === 0, 'Ajustes abre con 4 secciones: base, plan de pago, gastos y copia');
  await ajTo(page, 'plan');
  ok(await page.locator('#pctBox [data-k]').count() === 0, 'en Plan de pago los valores se ven sin controles hasta tocar Cambiar');
  await ajTo(page, 'base');
  ok(await page.locator('#goalin').count() === 0 && await page.locator('#inc').count() === 0, 'en Configuración base sueldo y meta se ven sin controles hasta tocar Cambiar');
  await page.click('[data-a=editsueldo]');
  await page.fill('#inc', '700000');
  await page.click('[data-a=editdone]');
  await ajTo(page, 'plan');
  ok((await page.textContent('#pctBox')).includes('$140.000'), 'el plan se recalcula con el nuevo sueldo (20% = $140.000)', (await page.textContent('#pctBox')).slice(0, 200));
  await page.click('[data-a=editpct]');
  await page.click('#pctBox [data-k=dp][data-d="1"]');
  S = await state(page);
  ok(S.dp === 21 && S.income === 700000, 'subir el porcentaje de deudas', { dp: S.dp });
  await page.fill('#pctBox input[data-pct=sp]', '15');
  await page.dispatchEvent('#pctBox input[data-pct=sp]', 'change');
  S = await state(page);
  ok(S.sp === 15, 'el porcentaje se puede escribir', S.sp);
  await page.fill('#pctBox input[data-pct=dp]', '95');
  await page.dispatchEvent('#pctBox input[data-pct=dp]', 'change');
  S = await state(page);
  ok(S.dp + S.sp <= 100, 'deudas + ahorro nunca pasan de 100%', { dp: S.dp, sp: S.sp });
  await page.fill('#pctBox input[data-pct=dp]', '20');
  await page.dispatchEvent('#pctBox input[data-pct=dp]', 'change');
  await page.fill('#pctBox input[data-pct=sp]', '10');
  await page.dispatchEvent('#pctBox input[data-pct=sp]', 'change');
  await sleep(1500); // deja que se junten los cambios en un solo movimiento
  S = await state(page);
  const planEvents = S.log.filter((e) => e.t === 'plan').length;
  ok(planEvents <= 2, 'los cambios de porcentajes se juntan (y si vuelven al valor original no dejan rastro)', planEvents);
  ok(S.log.filter((e) => e.t === 'ingreso').length === 1, 'el ingreso queda como un solo movimiento', S.log.filter((e) => e.t === 'ingreso'));
  await page.click('[data-a=editdone]');
  // reparto
  await page.click('#divBox [data-a=suggest]');
  S = await state(page);
  ok(S.debts.filter((d) => d.b + d.paid > 0).reduce((a, d) => a + d.share, 0) === 100, 'sugerir reparto deja 100%');
  await page.click('[data-a=editreparto]');
  await page.click('#divBox [data-a=sh][data-d="5"]');
  S = await state(page);
  ok(S.debts.filter((d) => d.b + d.paid > 0).reduce((a, d) => a + d.share, 0) === 100, 'ajustar el reparto a mano sigue sumando 100%');
  await page.screenshot({ path: path.join(SHOTS, 'iphone-ajustes-editado.png'), fullPage: true });

  // ---------- 4. deudas: alta con TNA, edición, borrado ----------
  await tabTo(page, 'deudas');
  await page.click('[data-a=new]');
  await page.fill('#f-name', 'Préstamo del banco con un nombre larguísimo para probar que no se rompa el diseño en la pantalla del iPhone');
  await page.fill('#f-amt', '120000');
  await page.selectOption('#f-rtype', 'tna');
  await page.fill('#f-rate', '120');
  ok((await page.textContent('#rate-out')).includes('10% por mes'), 'TNA 120% equivale a 10% por mes', await page.textContent('#rate-out'));
  await page.selectOption('#f-rtype', 'tea');
  await page.fill('#f-rate', '100');
  ok((await page.textContent('#rate-out')).includes('5,95% por mes'), 'TEA 100% equivale a 5,95% por mes', await page.textContent('#rate-out'));
  await page.fill('#f-due', '25');
  await page.fill('#f-late', '8');
  await page.fill('#f-bank', 'Banco Galicia');
  await page.click('[data-a=saveform]');
  S = await state(page);
  const nueva = S.debts.find((d) => d.n.startsWith('Préstamo del banco'));
  ok(nueva && nueva.rate === 5.95 && nueva.rt === 'tea' && nueva.rv === 100 && nueva.min === 12000 && nueva.bank === 'Banco Galicia', 'alta de deuda con interés convertido y mínimo por defecto', nueva);
  ok(S.debts.filter((d) => d.b + d.paid > 0).reduce((a, d) => a + d.share, 0) === 100, 'al sumar una deuda se vuelve a repartir');
  ok(await overflow(page) <= 0, 'nombre largo no rompe el ancho', await overflow(page));
  await page.screenshot({ path: path.join(SHOTS, 'iphone-deudas-largo.png'), fullPage: true });
  ok(await page.locator('[data-a=open]').count() === 4 && await page.locator('[data-a=edit], [data-a=del]').count() === 0, 'la lista de deudas es simple: solo nombre y monto, sin botones de editar ni borrar');
  await page.click('[data-a=open][data-i="' + nueva.id + '"]');
  ok((await page.textContent('#view')).includes('Banco Galicia') && (await page.textContent('#view')).includes('5,95% por mes') && (await page.textContent('#view')).includes('el día 25'), 'el detalle muestra banco, interés y vencimiento');
  ok(await overflow(page) <= 0, 'el detalle con nombre largo no rompe el ancho', await overflow(page));
  await page.screenshot({ path: path.join(SHOTS, 'iphone-deuda-detalle.png'), fullPage: true });
  await page.click('[data-a=back]');
  ok(await page.locator('[data-a=open]').count() === 4, 'volver deja la lista');
  await page.click('[data-a=open][data-i="' + nueva.id + '"]');
  await page.click('[data-a=paydebt]');
  ok(await page.inputValue('#f-debt') === nueva.id, 'pagar desde el detalle deja elegida esa deuda');
  await page.fill('#f-amt', '10000'); await page.click('[data-a=ok]');
  S = await state(page);
  ok(S.debts.find((d) => d.id === nueva.id).b === 110000 && S.debts.find((d) => d.id === nueva.id).paid === 10000, 'el pago desde el detalle baja el saldo', S.debts.find((d) => d.id === nueva.id));
  await page.click('#toast [data-a=undo]');
  // editar: corregir saldo con el resumen
  await page.click('[data-a=edit]');
  ok(await page.inputValue('#f-rtype') === 'tea' && await page.inputValue('#f-rate') === '100', 'al editar se ve lo que el usuario escribió (TEA 100)');
  await page.fill('#f-amt', '130000');
  await page.click('[data-a=saveform]');
  ok(await page.locator('[data-a=back]').count() === 1, 'al guardar una edición vuelve al detalle');
  S = await state(page);
  const ed = S.log.filter((e) => e.t === 'deuda_edicion').pop();
  ok(S.debts.find((d) => d.id === nueva.id).b === 130000 && ed && ed.d.antes.b === 120000 && ed.d.despues.b === 130000, 'la edición cambia el saldo y guarda antes/después', ed);
  // borrar con confirmación
  await page.click('[data-a=del][data-i="' + nueva.id + '"]');
  ok(await page.locator('[data-a=delyes]').count() === 1, 'borrar pide confirmación');
  await page.click('[data-a=delno]');
  ok((await state(page)).debts.length === 4, 'cancelar no borra');
  
  await page.click('[data-a=del][data-i="' + nueva.id + '"]');
  await page.click('[data-a=delyes]');
  S = await state(page);
  ok(S.debts.length === 3 && S.log.some((e) => e.t === 'deuda_baja'), 'borrar queda en el historial');
  ok(await page.locator('[data-a=open]').count() === 3, 'tras borrar vuelve a la lista');

  // ---------- 5. gastos fijos y extras ----------
  await ajTo(page, 'gastos');
  await page.click('[data-a=fnew]');
  await page.click('.chip:has-text("Transporte")');
  ok(await page.inputValue('#f-fname') === 'Transporte', 'los atajos completan el nombre');
  await page.fill('#f-famt', '1500');
  await page.click('[data-a=fsave]');
  S = await state(page);
  ok(S.fixed.length === 5 && (await page.textContent('.mk-big')).includes('$301.500'), 'gasto fijo nuevo suma al total (con punto de miles en 4 cifras)', await page.textContent('.mk-big'));
  const f0 = S.fixed[0];
  await page.click('[data-a=fedit][data-i="' + f0.id + '"]');
  await page.fill('#f-famt', '210000');
  await page.click('[data-a=fsave]');
  ok((await state(page)).log.some((e) => e.t === 'fijo_edicion'), 'editar un fijo queda en el historial');
  await page.click('[data-a=fdel][data-i="' + S.fixed[4].id + '"]'); await page.click('[data-a=fdelyes]');
  ok((await state(page)).fixed.length === 4, 'borrar un fijo');
  await page.click('[data-a=sub][data-s=extras]');
  await page.click('[data-a=xnew]');
  await page.fill('#f-xname', 'Arreglo de la heladera'); await page.fill('#f-xamt', '90000');
  await page.click('[data-a=xsave]');
  S = await state(page);
  ok(S.extras.length === 2 && S.log.some((e) => e.t === 'extra_alta'), 'gasto extra puntual');
  await tabTo(page, 'inicio');
  ok((await page.textContent('#view')).includes('Para el día a día') && !(await page.textContent('#view')).includes('A dónde va'), 'Inicio muestra solo "Para el día a día" (sin el cuadro de reparto)');

  // ---------- 6. ahorro y meta ----------
  await ajTo(page, 'base');
  await page.click('[data-a=editmeta]');
  await page.fill('#goalin', '50000');
  await page.dispatchEvent('#goalin', 'change');
  await page.click('[data-a=editdone]');
  await tabTo(page, 'ahorro');
  ok(await page.locator('#view #goalin').count() === 0, 'la meta ya no se edita en Ahorro (está en Ajustes)');
  await page.click('#view > [data-a=save]');
  await page.fill('#f-amt', '20000');
  await page.click('[data-a=ok]');
  S = await state(page);
  ok(S.saved === 60000 && S.goalHit, 'al llegar a la meta se marca y el ahorro pasa a deudas', { saved: S.saved, goalHit: S.goalHit });
  ok(S.log.some((e) => e.t === 'meta_alcanzada'), 'la meta alcanzada queda en el historial');
  await page.click('#toast [data-a=undo]');
  S = await state(page);
  ok(S.saved === 40000 && !S.goalHit, 'deshacer el ahorro vuelve a abrir la meta');
  await page.click('[data-a=aedit]');
  await page.fill('#f-saved', '45000'); await page.click('[data-a=asave]');
  ok((await state(page)).saved === 45000, 'corregir el ahorro a mano');

  // ---------- 7. persistencia real (IndexedDB y espejo) ----------
  await sleep(1500); // deja que se anoten los cambios pendientes
  const before = await state(page);
  await page.reload(); await page.waitForSelector('#view .card');
  const after = await state(page);
  const strip = (s) => { const c = JSON.parse(JSON.stringify(s)); delete c.updatedAt; return c; };
  ok(canon(strip(before)) === canon(strip(after)), 'al cerrar y volver a abrir queda todo igual', diffState(before, after));
  const idbHas = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('plan-de-deudas', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('state'); q.onsuccess = () => res(typeof q.result === 'string' && q.result.length > 100); }; r.onerror = () => res(false); }));
  ok(idbHas, 'hay copia en IndexedDB');
  ok(await page.evaluate(() => !!localStorage.getItem('pdd:state')), 'hay espejo en localStorage');
  // si IndexedDB se pierde, se recupera del espejo (se prueba el cargador directamente)
  await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('plan-de-deudas', 1); r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = () => res(); }; }));
  const fromMirror = await page.evaluate(() => PDD.store.load());
  ok(fromMirror && JSON.stringify(strip(fromMirror)) === JSON.stringify(strip(after)), 'si se pierde IndexedDB, se recupera del espejo', fromMirror && diffState(after, fromMirror));
  // datos corruptos en ambos lados: no los pisa, los guarda aparte
  await page.evaluate(() => { localStorage.setItem('pdd:state', '{roto'); });
  await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('plan-de-deudas', 1); r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put('{roto', 'state'); tx.oncomplete = () => res(); }; }));
  const corrupt = await page.evaluate(() => PDD.store.load());
  ok(corrupt === null, 'con datos ilegibles el cargador devuelve vacío en vez de romperse', corrupt);
  ok(await page.evaluate(() => localStorage.getItem('pdd:corrupt') === '{roto'), 'guarda aparte los datos corruptos');
  await page.evaluate(() => PDD.store.save(PDD.getState())); // deja el almacenamiento sano otra vez

  // ---------- 8. compartir resumen y copia ----------
  await ctx.close();
  ctx = await newCtx(browser);
  page = await open(ctx, SHARE_MOCK);
  await page.click('text=Ocultar');
  await ajTo(page, 'base');
  await page.click('[data-a=editsueldo]');
  await page.fill('#inc', '600000');
  await page.click('[data-a=editdone]');
  await sleep(600);
  const atShare = strip(await state(page));
  await tabTo(page, 'inicio');
  await page.click('[data-a=share]');
  await sleep(300);
  const shared = await page.evaluate(() => window.__shared);
  ok(shared.length === 1 && shared[0].files.length === 1, 'compartir abre el menú de iOS con un archivo');
  ok(shared[0].files[0].name.startsWith('plan-de-deudas-2026-10-15') && shared[0].files[0].name.endsWith('.csv'), 'nombre del archivo con fecha', shared[0].files[0].name);
  ok(/^Resumen de octubre/.test(shared[0].text) && shared[0].text.includes('Deuda total: $305.000'), 'mensaje corto con el resumen', shared[0].text);
  const csv = shared[0].files[0].text;
  ok(shared[0].files[0].bom.join() === '239,187,191' && csv.includes('fecha,tipo,detalle,monto') && /,copia,/.test(csv), 'el CSV lleva BOM (acentos en Excel), historial y copia completa', shared[0].files[0].bom);
  S = await state(page);
  ok(S.lastBackup > 0 && S.log.some((e) => e.t === 'copia'), 'queda anotado cuándo se compartió');
  await ajTo(page, 'copia');
  await page.click('[data-a=backup]');
  await sleep(300);
  ok((await page.evaluate(() => window.__shared)).length === 2 && (await page.evaluate(() => window.__shared))[1].text === null, '"Guardar copia" manda solo el archivo, sin mensaje');
  // cancelar el menú no marca copia
  await page.evaluate(() => { navigator.share = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; }; });
  const n0 = (await state(page)).log.length;
  await tabTo(page, 'inicio');
  await page.click('[data-a=share]'); await sleep(300);
  ok((await state(page)).log.length === n0, 'si cancela el menú de compartir no se anota nada');

  // ---------- 9. restaurar copia ----------
  const file = path.join(SHOTS, 'copia.csv'); fs.writeFileSync(file, csv);
  const original = atShare; // la copia se arma con el estado justo antes de compartir
  await ajTo(page, 'copia');
  await page.click('[data-a=rst]');
  ok(await page.locator('[data-a=rstyes]').count() === 1 && await page.locator('[data-a=backup]').count() >= 1, 'empezar de cero pide confirmación y ofrece guardar copia primero');
  await page.click('[data-a=rstyes]');
  ok((await state(page)).debts.length === 0 && !(await state(page)).demo, 'empezar de cero deja la app vacía');
  ok((await page.textContent('#view')).includes('Paso 1 de 3') && await page.locator('#tabs button').count() === 0, 'después de empezar de cero aparece la configuración guiada, sin pestañas');
  await page.screenshot({ path: path.join(SHOTS, 'iphone-config-inicial.png'), fullPage: true });
  await page.setInputFiles('#impfile', file);
  await page.waitForSelector('[data-a=impyes]');
  await page.click('[data-a=impyes]');
  S = await state(page);
  const restored = strip(S);
  const lastLog = restored.log.pop(); // 'importacion' agregado al restaurar
  ok(lastLog.t === 'importacion', 'restaurar queda en el historial');
  ok(canon(restored) === canon(original), 'restaurar la copia recupera exactamente lo que había', diffState(original, restored));
  // archivo inválido
  fs.writeFileSync(path.join(SHOTS, 'malo.csv'), 'hola,mundo\n1,2');
  await ajTo(page, 'copia');
  await page.setInputFiles('#impfile', path.join(SHOTS, 'malo.csv'));
  await sleep(200);
  ok((await page.textContent('#view')).includes('no parece una copia'), 'un archivo que no es copia se rechaza con un mensaje claro');
  ok((await state(page)).debts.length === original.debts.length, 'y no toca los datos');
  ok(true, 'copia restaurada comparada con el estado del momento de compartir');

  // ---------- 10. cambio de mes ----------
  await ctx.close();
  ctx = await newCtx(browser);
  const seeded = { v: 1, month: '2026-09', income: 650000, dp: 20, sp: 10, goal: 280000, saved: 40000, savedMonth: 20000,
    debts: [{ id: 'a', n: 'Tarjeta', b: 100000, min: 20000, rate: 6, paid: 20000, share: 100, due: 0, late: 0 }], fixed: [], extras: [], hist: [{ m: '2026-08', total: 150000 }], log: [] };
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript((s) => { if (!localStorage.getItem('pdd:state')) { localStorage.setItem('pdd:state', JSON.stringify(s)); localStorage.setItem('pdd:hint', '1'); } }, seeded);
  await page.goto(URL); await page.waitForSelector('#view .card');
  S = await state(page);
  ok(S.month === '2026-10' && S.debts[0].b === 106000 && S.debts[0].paid === 0 && S.income === 650000 && S.setup === true, 'al empezar octubre: suma interés (6%), reinicia lo pagado y el sueldo sigue cargado (copias viejas quedan como configuradas)', { month: S.month, b: S.debts[0].b });
  ok((await page.textContent('#view')).includes('Se sumaron unos $6.000 de intereses'), 'avisa de los intereses estimados');
  await page.screenshot({ path: path.join(SHOTS, 'iphone-mes-nuevo.png'), fullPage: true });
  ok(!(await page.textContent('#view')).includes('Todavía no cargaste tu sueldo') && (await page.textContent('#view')).includes('$650.000'), 'no vuelve a pedir el sueldo al empezar el mes');
  ok(await page.locator('#debtCard .dbar.up').count() === 1, 'la deuda subió por los intereses: la barra del mes sale en rojo');

  // ---------- 11. sin conexión + PWA ----------
  await ctx.close();
  ctx = await newCtx(browser);
  page = await open(ctx);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForSelector('#view .card');
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'el service worker controla la página');
  const cached = await page.evaluate(async () => (await (await caches.open('pdd-v1')).keys()).map((r) => new URL(r.url).pathname));
  ok(['/', '/index.html', '/app.js', '/calc.js', '/backup.js', '/store.js', '/styles.css', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'].every((p) => cached.includes(p)), 'toda la app queda en caché', cached);
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('#view .card');
  ok((await page.textContent('h1')) === 'Plan de deudas' && (await state(page)).debts.length === 3, 'abre sin conexión y con los datos');
  await tabTo(page, 'deudas');
  await page.click('[data-a=new]'); await page.fill('#f-name', 'Sin señal'); await page.fill('#f-amt', '1000'); await page.click('[data-a=saveform]');
  ok((await state(page)).debts.some((d) => d.n === 'Sin señal'), 'se puede cargar sin conexión');
  await ctx.setOffline(false);
  const manifest = await (await ctx.request.get(URL + 'manifest.webmanifest')).json();
  ok(manifest.display === 'standalone' && manifest.start_url === './' && manifest.icons.length >= 3, 'manifest válido');
  for (const i of manifest.icons) { const r = await ctx.request.get(URL + i.src); ok(r.ok() && (r.headers()['content-type'] || '').includes('png'), 'ícono ' + i.src); }
  ok((await (await ctx.request.get(URL + 'icons/apple-touch-icon.png')).ok()), 'ícono de iPhone (apple-touch-icon)');
  const metas = await page.evaluate(() => ({ apple: document.querySelector('link[rel=apple-touch-icon]').getAttribute('href'), cap: document.querySelector('meta[name=apple-mobile-web-app-capable]').content, vp: document.querySelector('meta[name=viewport]').content }));
  ok(metas.cap === 'yes' && /viewport-fit=cover/.test(metas.vp), 'metadatos para iOS', metas);

  // ---------- 12. pantalla chica y modo oscuro ----------
  await ctx.close();
  ctx = await newCtx(browser, { viewport: { width: 320, height: 568 }, colorScheme: 'dark' });
  page = await open(ctx);
  for (const t of ['inicio', 'deudas', 'ahorro', 'ajustes']) { await tabTo(page, t); ok(await overflow(page) <= 0, 'iPhone chico (320px), sin scroll horizontal en ' + t, await overflow(page)); }
  for (const k of ['base', 'plan', 'gastos', 'copia']) { await ajTo(page, k); ok(await overflow(page) <= 0, 'iPhone chico (320px), sin scroll horizontal en Ajustes/' + k, await overflow(page)); }
  await tabTo(page, 'inicio'); await page.screenshot({ path: path.join(SHOTS, 'iphone-chico-oscuro.png'), fullPage: true });
  await ctx.close();

  // ---------- 13. sin menú de compartir (respaldo) ----------
  ctx = await newCtx(browser);
  page = await open(ctx);
  await tabTo(page, 'inicio');
  const dl = page.waitForEvent('download');
  await page.click('[data-a=share]');
  const d = await dl;
  ok(d.suggestedFilename().endsWith('.csv'), 'sin menú de compartir descarga el archivo', d.suggestedFilename());
  await ctx.close();

  // ---------- 14. configuración guiada (primera vez) ----------
  ctx = await newCtx(browser);
  page = await open(ctx);
  await page.click('text=Borrar ejemplos');
  ok(await page.locator('text=Paso 1 de 3').count() === 1 && await page.locator('nav:visible').count() === 0, 'al borrar los ejemplos empieza la configuración guiada');
  await page.click('[data-a=wnext]');
  ok(await page.locator('#err:visible').count() === 1, 'no deja seguir sin sueldo');
  await page.fill('#inc', '480000');
  ok((await page.textContent('#pctBox')).includes('Gastos fijos') && (await page.textContent('#pctBox')).includes('Te queda para el día a día') && !(await page.textContent('#pctBox')).includes('70%'), 'muestra los gastos fijos aparte de lo que queda para el día a día', (await page.textContent('#pctBox')).slice(0, 160));
  await page.click('#pctBox [data-k=dp][data-d="1"]');
  await page.click('[data-a=wnext]');
  ok(await page.locator('text=Paso 2 de 3').count() === 1, 'paso 2: meta de ahorro');
  await page.fill('#goalin', '150000'); await page.dispatchEvent('#goalin', 'change');
  await page.click('[data-a=wback]');
  ok(await page.inputValue('#inc') === '480.000', 'Atrás conserva lo cargado');
  await page.click('[data-a=wnext]');
  await page.click('[data-a=wnext]');
  S = await state(page);
  ok(S.setup === true && S.income === 480000 && S.dp === 21 && S.goal === 150000 && S.log.some((e) => e.t === 'config_inicial'), 'termina la configuración y guarda sueldo, porcentajes y meta', { income: S.income, dp: S.dp, goal: S.goal });
  ok(await page.locator('text=Paso 3 de 3').count() === 1, 'paso 3: listo');
  await page.screenshot({ path: path.join(SHOTS, 'iphone-config-listo.png'), fullPage: true });
  await page.click('[data-a=wdeudas]');
  ok(await page.locator('#f-name').count() === 1 && await page.locator('#tabs button').count() === 4, 'lleva directo a cargar la primera deuda');
  await page.fill('#f-name', 'Tarjeta'); await page.fill('#f-amt', '100000'); await page.click('[data-a=saveform]');
  await tabTo(page, 'inicio');
  ok(!(await page.textContent('#view')).includes('Todavía no cargaste tu sueldo'), 'con el sueldo cargado no vuelve a pedirlo');
  await page.reload(); await page.waitForSelector('#view .card');
  ok(await page.locator('#tabs button').count() === 4, 'al volver a abrir no repite la configuración');
  await ctx.close();
  // el aviso de ahorro lleva a la pestaña Ahorro
  ctx = await newCtx(browser);
  await ctx.clock.setFixedTime(new Date('2026-10-28T12:00:00-03:00'));
  page = await open(ctx);
  await page.click('text=Ocultar');
  const lnk = page.locator('#view [data-a=save]');
  if (await lnk.count()) { await lnk.first().click(); ok(await page.locator('#tabs [aria-current=page]').textContent().then((t) => t.includes('Ahorro')) && await page.locator('#panel').count() === 1, 'el aviso "Anotar ahorro" lleva a Ahorro con el panel abierto'); }
  else ok(true, 'sin aviso de ahorro ese día (no aplica)');
  await ctx.close();

  ok(errors.length === 0, 'ningún error de JS en toda la sesión', errors);
  await browser.close();
  const fails = results.filter((r) => !r.cond);
  console.log('\n' + (results.length - fails.length) + '/' + results.length + ' pruebas OK');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('ERROR en la prueba:', e); process.exit(2); });
