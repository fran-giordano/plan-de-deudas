// Pruebas de la lógica: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../calc.js');
const B = require('../backup.js');

const NOW = new Date(2026, 9, 15, 12, 0); // 15/10/2026
const clone = (x) => JSON.parse(JSON.stringify(x));
const mk = () => { const S = P.demo(NOW); S.demo = false; return S; };

test('formato de pesos con puntos también en 4 cifras', () => {
  assert.equal(P.fmt(1500), '$1.500');
  assert.equal(P.fmt(155000), '$155.000');
  assert.equal(P.fmt(-2500), '−$2.500');
  assert.equal(P.fmtNum(0), '');
});

test('conversión TNA / TEA a mensual', () => {
  assert.equal(P.toMonthly('m', 6), 6);
  assert.equal(P.toMonthly('tna', 120), 10);
  assert.equal(P.toMonthly('tea', 100), 5.95);
  assert.equal(P.toMonthly('tea', 0), 0);
});

test('los porcentajes de reparto siempre suman 100', () => {
  const S = mk();
  S.debts.forEach((d, i) => { d.share = [33.3, 33.3, 33.3][i]; });
  P.normalize(S);
  assert.equal(S.debts.reduce((a, d) => a + d.share, 0), 100);
  S.debts.forEach((d) => { d.share = 0; });
  P.normalize(S);
  assert.equal(S.debts.reduce((a, d) => a + d.share, 0), 100);
});

test('plan del demo: primero los mínimos y los números cierran', () => {
  const S = mk(); const C = P.calc(S);
  assert.equal(C.sumMin, 60000);
  assert.equal(C.dAmt, 120000);
  assert.equal(C.sAmt, 60000);
  S.debts.forEach((d) => assert.ok(C.t[d.id] >= Math.min(d.min, d.b + d.paid)));
  assert.equal(C.T, S.debts.reduce((a, d) => a + C.t[d.id], 0));
  assert.equal(C.free, S.income - C.T - C.sAmt - C.fixedTotal - C.extraTotal);
  assert.equal(C.Pd, 25000);
});

test('si el porcentaje no alcanza para los mínimos, se usan los mínimos y se avisa', () => {
  const S = mk(); S.dp = 5; const C = P.calc(S);
  assert.equal(C.monthly, C.sumMin);
  assert.ok(C.short);
  assert.ok(P.alerts(S, C, NOW).some((a) => /mínimos/.test(a.t)));
});

test('colchón en la meta: el ahorro pasa a deudas', () => {
  const S = mk(); S.saved = S.goal;
  const C = P.calc(S);
  assert.ok(C.full);
  assert.equal(C.sAmt, 0);
  assert.equal(C.dAmt, Math.round(S.income * (S.dp + S.sp) / 100));
});

test('sugerir reparto: mínimos primero y el resto a la de mayor interés', () => {
  const S = mk(); S.income = 800000;
  P.suggest(S); const C = P.calc(S);
  const tarjeta = S.debts.find((d) => d.n === 'Tarjeta');
  const amigo = S.debts.find((d) => d.n === 'Préstamo de un amigo');
  assert.ok(C.t[tarjeta.id] > tarjeta.min, 'la de 6% recibe lo que sobra');
  assert.equal(C.t[amigo.id], amigo.min, 'la sin interés queda en su mínimo');
  assert.equal(S.debts.reduce((a, d) => a + d.share, 0), 100);
});

test('sugerir reparto desborda a la siguiente cuando la primera se salda', () => {
  const S = mk(); S.income = 2000000; S.dp = 50;
  S.debts[0].b = 10000; S.debts[0].paid = 0; S.debts[0].min = 5000;
  P.suggest(S); const C = P.calc(S);
  assert.equal(C.t[S.debts[0].id], 10000);
  const c3 = S.debts[2];
  assert.ok(C.t[c3.id] > c3.min);
});

test('proyección: termina, y sin plata para intereses avisa', () => {
  const S = mk(); const C = P.calc(S); const sim = P.simulate(S, C);
  assert.ok(sim.ok && sim.months > 0 && sim.months < 60);
  assert.equal(sim.series.length, sim.months);
  const S2 = mk(); S2.debts.forEach((d) => { d.min = 1; d.rate = 20; d.b = 1000000; });
  S2.income = 100000; S2.dp = 1;
  const C2 = P.calc(S2);
  assert.equal(P.simulate(S2, C2).ok, false);
  assert.ok(P.alerts(S2, C2, NOW).some((a) => /no baja/.test(a.t)));
});

test('avisos: vencida, por vencer, gastos que superan lo cobrado', () => {
  const S = mk(); S.debts[0].due = 14; S.debts[0].paid = 0;
  let C = P.calc(S);
  assert.ok(P.alerts(S, C, NOW).some((a) => /venció/.test(a.t) && a.lv === 'bad'));
  S.debts[0].due = 17; C = P.calc(S);
  assert.ok(P.alerts(S, C, NOW).some((a) => /vence en 2 días/.test(a.t)));
  S.income = 300000; C = P.calc(S);
  assert.ok(P.alerts(S, C, NOW).some((a) => /superan lo que cobraste/.test(a.t)));
});

test('aviso de recargo estimado usa el porcentaje opcional', () => {
  const S = mk(); S.debts[0].due = 14; S.debts[0].paid = 0; S.debts[0].late = 10;
  const C = P.calc(S);
  const li = P.lateInfo(S, C, S.debts[0], NOW);
  assert.equal(li.extra, Math.round(li.left * 0.1));
  S.debts[0].late = 0;
  assert.equal(P.lateInfo(S, C, S.debts[0], NOW).extra, 0);
});

test('deuda que sube respecto del cierre anterior', () => {
  const S = mk(); S.hist = [{ m: '2026-09', total: 100000 }];
  assert.ok(P.alerts(S, P.calc(S), NOW).some((a) => /subió/.test(a.t)));
  assert.ok(!P.alerts(S, P.calc(S), new Date(2026, 9, 3)).some((a) => /subió/.test(a.t)), 'no antes del día 10');
});

test('pago del mes va lento', () => {
  const S = mk(); S.debts.forEach((d) => { d.paid = 0; d.due = 0; });
  const C = P.calc(S);
  assert.ok(P.alerts(S, C, new Date(2026, 9, 18)).some((a) => /va lento/.test(a.t)));
});

test('cambio de mes: cierra, suma intereses, reinicia lo del mes', () => {
  const S = mk(); S.month = '2026-09';
  const b0 = S.debts[0].b, total0 = S.debts.reduce((a, d) => a + d.b, 0);
  const r = P.rollover(S, NOW);
  assert.equal(S.month, '2026-10');
  assert.equal(S.hist[S.hist.length - 1].m, '2026-09');
  assert.equal(S.hist[S.hist.length - 1].total, total0);
  assert.equal(S.debts[0].b, b0 + Math.round(b0 * 0.06));
  assert.equal(S.debts[1].b, 60000, 'sin interés no cambia');
  assert.ok(S.debts.every((d) => d.paid === 0));
  assert.equal(S.income, 600000, 'el sueldo es fijo: no se reinicia al cambiar de mes');
  assert.equal(S.savedMonth, 0);
  assert.ok(r.interest > 0);
  assert.equal(S.log[S.log.length - 1].t, 'mes_nuevo');
  assert.equal(P.rollover(S, NOW), null, 'no repite en el mismo mes');
});

test('cambio de mes con varios meses sin abrir la app', () => {
  const S = mk(); S.month = '2026-07'; S.hist = [];
  P.rollover(S, NOW);
  assert.equal(S.month, '2026-10');
  assert.equal(S.log.filter((e) => e.t === 'mes_nuevo').length, 3);
  assert.deepEqual(S.hist.map((h) => h.m), ['2026-07', '2026-08', '2026-09']);
});

test('cambio de año', () => {
  assert.equal(P.monthAdd('2026-12', 1), '2027-01');
  assert.equal(P.monthAdd('2026-01', -1), '2025-12');
  const S = mk(); S.month = '2026-12';
  P.rollover(S, new Date(2027, 0, 5));
  assert.equal(S.month, '2027-01');
});

test('los extras de otros meses no cuentan en el mes actual', () => {
  const S = mk(); S.extras.push({ id: 'old', n: 'viejo', a: 99999, ts: new Date(2026, 7, 3).getTime() });
  assert.equal(P.calc(S).extraTotal, 35000);
});

test('copia CSV: ida y vuelta conserva todo, con caracteres raros', () => {
  const S = mk();
  S.debts[0].n = 'Tarjeta "Visa", con coma\ny salto';
  S.debts[1].n = '=HYPERLINK("x")';
  P.logEv(S, 'pago', { id: 'd1', n: S.debts[0].n, monto: 5000 });
  P.logEv(S, 'ingreso', { antes: 0, despues: 600000 });
  P.logEv(S, 'reparto', { motivo: 'sugerido', antes: { a: 50 }, despues: { a: 100 } });
  const csv = B.toCSV(S, P.calc(S), NOW);
  assert.ok(csv.startsWith('fecha,tipo,detalle,monto'));
  assert.ok(!/^=HYPER/m.test(csv), 'texto que empieza con = va neutralizado');
  const back = B.fromCSV('﻿' + csv);
  const a = clone(S), b = clone(back); delete a.updatedAt; delete b.updatedAt;
  assert.deepEqual(b, a);
});

test('copia CSV: rechaza archivos que no son copias y copias dañadas', () => {
  assert.throws(() => B.fromCSV('a,b,c\n1,2,3'), /no parece una copia/);
  assert.throws(() => B.fromCSV('x,copia,{no es json,'), /dañada/);
  assert.throws(() => B.fromCSV('x,copia,"[1,2]",'), /dañada/);
});

test('importar sanea datos hostiles', () => {
  const evil = { month: 'zzz', income: '12abc', dp: 999, sp: 999, debts: [{ id: 'a', n: '<img src=x onerror=alert(1)>', b: -5, min: 'x', rate: 1e9, share: 'q' }, null, 7],
    log: [{ ts: 1, t: 'pago', d: JSON.parse('{"__proto__":{"x":1},"n":"ok"}') }], extras: 'no', hist: [{ m: 'bad', total: 1 }] };
  const S = P.sanitize(evil);
  assert.match(S.month, /^\d{4}-\d{2}$/);
  assert.equal(S.income, 0);
  assert.ok(S.dp + S.sp <= 100);
  assert.equal(S.debts.length, 1);
  assert.equal(S.debts[0].b, 0);
  assert.ok(S.debts[0].rate <= 1000);
  assert.deepEqual(S.extras, []);
  assert.deepEqual(S.hist, []);
  assert.equal(({}).x, undefined, 'no contamina el prototipo');
  assert.equal(P.sanitize(null), null);
  assert.equal(P.sanitize([]), null);
});

test('ids repetidos se corrigen al importar', () => {
  const S = P.sanitize({ debts: [{ id: 'x', n: 'a' }, { id: 'x', n: 'b' }, { n: 'c' }] });
  const ids = S.debts.map((d) => d.id);
  assert.equal(new Set(ids).size, 3);
});

test('texto del resumen para compartir', () => {
  const S = mk(); S.hist = [{ m: '2026-09', total: 330000 }];
  const t = B.summaryText(S, P.calc(S), NOW);
  assert.match(t, /^Resumen de octubre/);
  assert.match(t, /Deuda total: \$305\.000 \(bajó \$25\.000/);
  assert.match(t, /Ahorro: \$40\.000 de \$280\.000/);
});

test('el historial describe ediciones y borrados', () => {
  assert.deepEqual(B.describe({ t: 'deuda_baja', d: { n: 'X', b: 5000 } }), ['Deuda borrada', '"X" (saldo $5.000)', 5000]);
  const e = B.describe({ t: 'deuda_edicion', d: { n: 'X', antes: { b: 1000, rate: 3 }, despues: { b: 2000, rate: 3 } } });
  assert.match(e[1], /saldo: \$1\.000 → \$2\.000/);
});

test('aviso de copia de seguridad vieja', () => {
  const S = mk(); for (let i = 0; i < 6; i++) P.logEv(S, 'ahorro', { monto: 1 }, NOW.getTime() - 60 * P.DAY);
  S.debts.forEach((d) => { d.due = 0; });
  assert.ok(P.alerts(S, P.calc(S), NOW).some((a) => a.a === 'backup'));
  S.lastBackup = NOW.getTime() - 2 * P.DAY;
  assert.ok(!P.alerts(S, P.calc(S), NOW).some((a) => a.a === 'backup'));
});

test('configuración inicial: copias viejas con datos se dan por configuradas', () => {
  assert.equal(P.sanitize({ income: 500000 }).setup, true);
  assert.equal(P.sanitize({ debts: [{ n: 'x', b: 1 }] }).setup, true);
  assert.equal(P.sanitize({}).setup, false, 'vacío: falta configurar');
  assert.equal(P.sanitize({ income: 500000, setup: false }).setup, false, 'si la marca está, se respeta');
  assert.equal(P.blank(NOW).setup, false);
  assert.equal(P.demo(NOW).setup, true);
});

test('banco de la deuda: opcional, se sanea y viaja en la copia', () => {
  assert.equal(P.sanitize({ debts: [{ id: 'a', n: 'x', b: 1 }] }).debts[0].bank, '', 'copias viejas sin banco');
  const S = mk(); S.debts[0].bank = 'Galicia';
  const back = B.fromCSV(B.toCSV(S, P.calc(S), NOW));
  assert.equal(back.debts[0].bank, 'Galicia');
  assert.equal(P.sanitize({ debts: [{ id: 'a', n: 'x', b: 1, bank: 'x'.repeat(200) }] }).debts[0].bank.length, 40);
});

test('sin sueldo cargado el aviso lleva a Ajustes', () => {
  const S = P.blank(NOW); S.setup = true;
  const a = P.alerts(S, P.calc(S), NOW).find((x) => /sueldo/.test(x.t));
  assert.ok(a && a.a === 'tab' && a.d === 'ajustes/base');
});
