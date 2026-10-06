/* Lógica pura del plan de deudas: sin DOM, se prueba en Node y corre en el navegador. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PDD = root.PDD || {}; root.PDD.calc = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DAY = 86400000;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function monthAdd(k, n) { var t = (+k.slice(0, 4)) * 12 + (+k.slice(5, 7) - 1) + n; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); }
  function monthName(k) { return MONTHS[+k.slice(5, 7) - 1]; }
  function shortName(k) { return monthName(k).slice(0, 3); }
  function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
  function sum(a, f) { var s = 0; for (var i = 0; i < a.length; i++) s += f(a[i]); return s; }
  // Separador de miles propio: el locale es-AR no agrega punto en números de 4 cifras.
  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fmt(n) { n = Math.round(n); return (n < 0 ? '−' : '') + '$' + group(Math.abs(n)); }
  function fmtNum(n) { return n > 0 ? group(Math.round(n)) : ''; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // TNA / TEA / mensual -> interés mensual en %
  function toMonthly(t, v) {
    var x = v / 100;
    var m = t === 'tna' ? x / 12 : t === 'tea' ? Math.pow(1 + x, 1 / 12) - 1 : x;
    return Math.round(m * 10000) / 100;
  }

  function isAct(d) { return d.b + d.paid > 0; }
  function logEv(S, t, d, ts) { S.log.push({ ts: ts || Date.now(), t: t, d: d || {} }); }

  function blank(now) {
    return {
      v: 1, updatedAt: 0, month: monthKey(now), income: 0, prevIncome: 0, dp: 20, sp: 10, setup: false,
      goal: 0, saved: 0, savedMonth: 0, goalHit: false, demo: false, lastBackup: 0, flash: null,
      debts: [], fixed: [], extras: [], hist: [], log: []
    };
  }

  function demo(now) {
    var S = blank(now), d = now.getDate(), dim = daysInMonth(now), k = S.month;
    S.demo = true; S.setup = true; S.income = 600000; S.dp = 20; S.sp = 10; S.saved = 40000; S.goal = 280000; S.savedMonth = 20000;
    S.debts = [
      { id: 'd1', n: 'Tarjeta', b: 155000, min: 25000, rate: 6, rt: 'm', rv: 6, due: Math.max(1, d - 1), late: 10, paid: 25000, share: 40, bank: '' },
      { id: 'd2', n: 'Préstamo de un amigo', b: 60000, min: 15000, rate: 0, rt: 'm', rv: 0, due: 20, late: 0, paid: 0, share: 25, bank: '' },
      { id: 'd3', n: 'Cuotas electrodoméstico', b: 90000, min: 20000, rate: 3, rt: 'm', rv: 3, due: Math.min(dim, d + 1), late: 5, paid: 0, share: 35, bank: '' }
    ];
    S.fixed = [
      { id: 'f1', n: 'Alquiler', a: 200000 }, { id: 'f2', n: 'Servicios (luz, gas, agua)', a: 45000 },
      { id: 'f3', n: 'Internet y celular', a: 25000 }, { id: 'f4', n: 'Transporte', a: 30000 }
    ];
    S.extras = [{ id: 'x1', n: 'Curso de inglés', a: 35000, ts: now.getTime() }];
    S.hist = [{ m: monthAdd(k, -3), total: 380000 }, { m: monthAdd(k, -2), total: 355000 }, { m: monthAdd(k, -1), total: 330000 }];
    return S;
  }

  // Los porcentajes de reparto entre deudas activas suman siempre 100.
  function normalize(S) {
    var act = S.debts.filter(isAct);
    if (!act.length) return;
    var s = sum(act, function (d) { return d.share || 0; });
    if (s <= 0) { act.forEach(function (d) { d.share = 100 / act.length; }); s = 100; }
    var tot = 0, big = act[0];
    act.forEach(function (d) { d.share = Math.round(d.share / s * 100); tot += d.share; if (d.share > big.share) big = d; });
    big.share += 100 - tot;
  }

  function calc(S) {
    normalize(S);
    var full = S.goal > 0 && S.saved >= S.goal;
    var effSp = full ? 0 : S.sp, effDp = full ? S.dp + S.sp : S.dp;
    var act = S.debts.filter(isAct);
    var sumMin = sum(act, function (d) { return d.min; });
    var dAmt = Math.round(S.income * effDp / 100), sAmt = Math.round(S.income * effSp / 100);
    var monthly = Math.max(dAmt, sumMin);
    var C = { full: full, dAmt: dAmt, sAmt: sAmt, sumMin: sumMin, monthly: monthly, short: S.income > 0 && dAmt < sumMin, t: {}, floor: {} };
    S.debts.forEach(function (d) {
      var sb = d.b + d.paid;
      if (sb > 0) {
        var al = Math.round(monthly * d.share / 100);
        C.floor[d.id] = al < d.min;
        C.t[d.id] = Math.min(sb, Math.max(al, d.min));
      } else { C.t[d.id] = 0; C.floor[d.id] = false; }
    });
    C.T = sum(S.debts, function (d) { return C.t[d.id]; });
    C.Pd = sum(S.debts, function (d) { return Math.min(d.paid, C.t[d.id]); });
    C.fixedTotal = sum(S.fixed, function (f) { return f.a; });
    C.extraTotal = sum(S.extras.filter(function (e) { return monthKey(new Date(e.ts)) === S.month; }), function (e) { return e.a; });
    C.free = S.income - C.T - C.sAmt - C.fixedTotal - C.extraTotal;
    return C;
  }

  // Proyección mes a mes con el reparto actual; lo que sobra va a la de mayor interés.
  function simulate(S, C) {
    var ds = S.debts.filter(function (d) { return d.b > 0; }).map(function (d) { return { b: d.b, r: (d.rate || 0) / 100, min: d.min, s: d.share || 0 }; });
    if (!ds.length) return { months: 0, interest: 0, ok: true, series: [] };
    if (C.monthly <= 0) return { months: 0, interest: 0, ok: false, series: [] };
    var months = 0, interest = 0, ser = [];
    while (ds.some(function (d) { return d.b > 0.5; }) && months < 600) {
      months++;
      ds.forEach(function (d) { if (d.b > 0.5) { var i = d.b * d.r; d.b += i; interest += i; } });
      var act = ds.filter(function (d) { return d.b > 0.5; });
      var ss = sum(act, function (d) { return d.s; }) || 1, left = C.monthly;
      act.forEach(function (d) { var pay = Math.min(d.b, Math.max(d.min, C.monthly * d.s / ss)); d.b -= pay; left -= pay; });
      if (left > 0) act.filter(function (d) { return d.b > 0.5; }).sort(function (x, y) { return y.r - x.r; }).forEach(function (d) {
        if (left <= 0) return; var pay = Math.min(d.b, left); d.b -= pay; left -= pay;
      });
      ser.push(sum(ds, function (d) { return Math.max(0, d.b); }));
    }
    return { months: months, interest: interest, ok: months < 600, series: ser };
  }

  // Sugerir reparto: primero los mínimos; lo que sobra va a la de mayor interés (y desborda a la siguiente).
  function suggest(S) {
    var C = calc(S), act = S.debts.filter(isAct);
    if (!act.length || C.monthly <= 0) return false;
    var alloc = {};
    act.forEach(function (d) { alloc[d.id] = Math.min(d.min, d.b + d.paid); });
    var left = C.monthly - sum(act, function (d) { return alloc[d.id]; });
    act.slice().sort(function (x, y) { return (y.rate || 0) - (x.rate || 0) || (x.b + x.paid) - (y.b + y.paid); }).forEach(function (d) {
      if (left <= 0) return;
      var add = Math.min(d.b + d.paid - alloc[d.id], left);
      alloc[d.id] += add; left -= add;
    });
    act.forEach(function (d) { d.share = alloc[d.id] / C.monthly * 100; });
    normalize(S);
    return true;
  }

  function lateInfo(S, C, d, now) {
    if (!d.due || d.b <= 0) return null;
    var t = C.t[d.id] || 0, left = t - Math.min(d.paid, t);
    if (left <= 0) return null;
    var dd = d.due - now.getDate();
    return { left: left, dd: dd, over: dd < 0, extra: Math.round(left * (d.late || 0) / 100) };
  }

  function whenText(dd) { return dd === 0 ? 'hoy' : dd === 1 ? 'mañana' : 'en ' + dd + ' días'; }

  function alerts(S, C, now) {
    var L = [], day = now.getDate(), dim = daysInMonth(now), frac = day / dim;
    var tot = sum(S.debts, function (d) { return d.b; });
    var prev = S.hist.length ? S.hist[S.hist.length - 1].total : null;
    var sim = simulate(S, C);
    if (S.income <= 0) L.push({ lv: 'warn', t: 'Todavía no cargaste tu sueldo. Sin eso no se puede calcular el plan.', a: 'tab', d: 'ajustes/base', al: 'Cargar sueldo' });
    S.debts.forEach(function (d) {
      var li = lateInfo(S, C, d, now); if (!li) return;
      if (li.over) L.push({ lv: 'bad', t: d.n + ' venció el día ' + d.due + '. Faltan ' + fmt(li.left) + ' del pago del mes' + (li.extra > 0 ? ' y el banco puede sumar unos ' + fmt(li.extra) + ' de recargo (serían ' + fmt(li.left + li.extra) + ').' : '.'), a: 'pay', al: 'Registrar pago' });
      else if (li.dd <= 5) L.push({ lv: 'warn', t: d.n + ' vence ' + whenText(li.dd) + '. Faltan ' + fmt(li.left) + (li.extra > 0 ? '. Si no se paga a tiempo, se sumarían unos ' + fmt(li.extra) + ' de recargo.' : '.'), a: 'pay', al: 'Registrar pago' });
    });
    if (S.income > 0 && C.free < 0) L.push({ lv: 'bad', t: 'Los gastos fijos, los extras y el plan superan lo que cobraste por ' + fmt(-C.free) + '.', a: 'tab', d: 'ajustes/plan', al: 'Ajustar el plan' });
    if (S.income > 0 && C.extraTotal > S.income * 0.15) L.push({ lv: 'warn', t: 'Los gastos extras de este mes suman ' + fmt(C.extraTotal) + ' (' + Math.round(C.extraTotal / S.income * 100) + '% de lo que cobraste). Si el mes viene justo, conviene posponer alguno.', a: 'xgo', al: 'Ver extras' });
    if (C.short) L.push({ lv: 'warn', t: 'El porcentaje de deudas no alcanza para los pagos mínimos (' + fmt(C.sumMin) + ').', a: 'tab', d: 'ajustes/plan', al: 'Ajustar el plan' });
    if (tot > 0 && S.income > 0 && !sim.ok) L.push({ lv: 'bad', t: 'Con este plan la deuda no baja: el pago no cubre los intereses.', a: 'tab', d: 'ajustes/plan', al: 'Ajustar el plan' });
    if (prev !== null && tot > prev && day >= 10) L.push({ lv: 'bad', t: 'La deuda subió ' + fmt(tot - prev) + ' respecto del cierre del mes pasado. Revisá si sumaste deudas o si los intereses superan lo que pagaste.' });
    if (C.T > 0 && C.T - C.Pd > 0) {
      var left = dim - day;
      if (left <= 5) L.push({ lv: 'warn', t: 'Quedan ' + left + (left === 1 ? ' día' : ' días') + ' del mes y faltan ' + fmt(C.T - C.Pd) + ' para cerrar el pago.', a: 'pay', al: 'Registrar pago' });
      else if (day >= 10 && C.Pd / C.T < frac - 0.25) L.push({ lv: 'warn', t: 'El pago del mes va lento: llevás el ' + Math.round(C.Pd / C.T * 100) + '% y ya pasó el ' + Math.round(frac * 100) + '% del mes.', a: 'pay', al: 'Registrar pago' });
    }
    if (!C.full && C.sAmt > 0 && day >= 15 && S.savedMonth < C.sAmt * frac - C.sAmt * 0.25) L.push({ lv: 'warn', t: 'Falta apartar ' + fmt(C.sAmt - S.savedMonth) + ' para el ahorro de este mes.', a: 'save', al: 'Anotar ahorro' });
    L.sort(function (x, y) { return (x.lv === 'bad' ? 0 : 1) - (y.lv === 'bad' ? 0 : 1); });
    L = L.slice(0, 4);
    if (!S.demo && S.log.length >= 5 && L.length < 4) {
      var ref = S.lastBackup || S.log[0].ts;
      if (now.getTime() - ref > 30 * DAY) L.push({ lv: 'warn', t: 'Hace más de un mes que no guardás una copia de tus datos.', a: 'backup', al: 'Guardar copia' });
    }
    return L;
  }

  // Al empezar un mes nuevo: cierra el anterior, suma intereses estimados y reinicia lo del mes.
  function rollover(S, now) {
    var cur = monthKey(now), n = 0, intTotal = 0, months = 0;
    if (S.month >= cur) return null;
    while (S.month < cur && n < 240) {
      n++;
      S.hist.push({ m: S.month, total: sum(S.debts, function (d) { return d.b; }) });
      var items = [];
      S.debts.forEach(function (d) {
        if (d.b > 0 && d.rate > 0) {
          var add = Math.round(d.b * d.rate / 100);
          if (add > 0) { d.b += add; items.push({ n: d.n, m: add }); intTotal += add; }
        }
        d.paid = 0;
      });
      S.savedMonth = 0; // el sueldo es fijo: se carga una vez y no se reinicia
      S.month = monthAdd(S.month, 1);
      logEv(S, 'mes_nuevo', { mes: S.month, intereses: items }, now.getTime());
      months++;
    }
    if (S.month < cur) S.month = cur;
    S.flash = intTotal > 0 ? { interest: intTotal, months: months } : null;
    return S.flash || { interest: 0, months: months };
  }

  // ---- validación de datos que vienen de afuera (copia importada, almacenamiento) ----
  function num(x, lo, hi, def) { x = Number(x); if (!isFinite(x)) return def; return Math.min(hi, Math.max(lo, x)); }
  function int(x) { return Math.round(num(x, 0, 1e12, 0)); }
  function str(x, n) { return String(x == null ? '' : x).slice(0, n || 80); }
  function cleanJSON(v, depth) {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'string') return v.slice(0, 200);
    if (depth > 3) return null;
    if (Array.isArray(v)) return v.slice(0, 60).map(function (x) { return cleanJSON(x, depth + 1); });
    if (typeof v === 'object') {
      var o = {};
      Object.keys(v).slice(0, 40).forEach(function (k) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
        o[str(k, 80)] = cleanJSON(v[k], depth + 1);
      });
      return o;
    }
    return null;
  }
  function uniq(list) {
    var seen = {};
    list.forEach(function (x) { if (!x.id || seen[x.id]) x.id = uid() + Math.random().toString(36).slice(2, 5); seen[x.id] = 1; });
    return list;
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    var now = new Date();
    var S = {
      v: 1, updatedAt: num(raw.updatedAt, 0, 8.64e15, 0),
      month: /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.month) ? raw.month : monthKey(now),
      income: int(raw.income), prevIncome: int(raw.prevIncome), setup: false, dp: Math.round(num(raw.dp, 0, 100, 20)), sp: Math.round(num(raw.sp, 0, 100, 10)),
      goal: int(raw.goal), saved: int(raw.saved), savedMonth: int(raw.savedMonth), goalHit: !!raw.goalHit, demo: !!raw.demo,
      lastBackup: num(raw.lastBackup, 0, 8.64e15, 0),
      flash: raw.flash && typeof raw.flash === 'object' ? { interest: int(raw.flash.interest), months: int(raw.flash.months) } : null,
      debts: [], fixed: [], extras: [], hist: [], log: []
    };
    if (S.dp + S.sp > 100) S.sp = 100 - S.dp;
    if (Array.isArray(raw.debts)) S.debts = raw.debts.slice(0, 100).filter(function (d) { return d && typeof d === 'object'; }).map(function (d) {
      return {
        id: str(d.id, 30), n: str(d.n), b: int(d.b), min: int(d.min), rate: Math.round(num(d.rate, 0, 1000, 0) * 100) / 100,
        rt: d.rt === 'tna' || d.rt === 'tea' ? d.rt : 'm', rv: num(d.rv, 0, 100000, 0), due: Math.round(num(d.due, 0, 31, 0)),
        late: num(d.late, 0, 1000, 0), paid: int(d.paid), share: num(d.share, 0, 100, 0), bank: str(d.bank, 40)
      };
    });
    if (Array.isArray(raw.fixed)) S.fixed = raw.fixed.slice(0, 300).filter(function (f) { return f && typeof f === 'object'; }).map(function (f) { return { id: str(f.id, 30), n: str(f.n), a: int(f.a) }; });
    if (Array.isArray(raw.extras)) S.extras = raw.extras.slice(0, 5000).filter(function (e) { return e && typeof e === 'object'; }).map(function (e) { return { id: str(e.id, 30), n: str(e.n), a: int(e.a), ts: num(e.ts, 0, 8.64e15, Date.now()) }; });
    if (Array.isArray(raw.hist)) S.hist = raw.hist.slice(0, 1200).filter(function (h) { return h && /^\d{4}-(0[1-9]|1[0-2])$/.test(h.m); }).map(function (h) { return { m: h.m, total: int(h.total) }; });
    if (Array.isArray(raw.log)) S.log = raw.log.slice(0, 100000).filter(function (e) { return e && typeof e === 'object'; }).map(function (e) {
      var d = cleanJSON(e.d, 0); return { ts: num(e.ts, 0, 8.64e15, 0), t: str(e.t, 30), d: d && typeof d === 'object' && !Array.isArray(d) ? d : {} };
    });
    uniq(S.debts); uniq(S.fixed); uniq(S.extras);
    // Copias anteriores no traen la marca: si ya hay datos, la configuración inicial se da por hecha.
    S.setup = typeof raw.setup === 'boolean' ? raw.setup : (S.debts.length > 0 || S.income > 0 || S.log.length > 0);
    return S;
  }

  return {
    MONTHS: MONTHS, DAY: DAY, monthKey: monthKey, monthAdd: monthAdd, monthName: monthName, shortName: shortName, daysInMonth: daysInMonth,
    fmt: fmt, fmtNum: fmtNum, uid: uid, toMonthly: toMonthly, isAct: isAct, logEv: logEv, blank: blank, demo: demo, normalize: normalize,
    calc: calc, simulate: simulate, suggest: suggest, lateInfo: lateInfo, whenText: whenText, alerts: alerts, rollover: rollover, sanitize: sanitize, sum: sum
  };
});
