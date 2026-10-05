/* Plan de deudas: interfaz. Todo el estado vive en S y se guarda en el celular (store.js). */
(function () {
  'use strict';
  var P = PDD.calc, B = PDD.backup, ST = PDD.store;
  var VERSION = '1.0.0';
  var S = null, C = {}, tab = 'inicio', undoInfo = null, toastT = null, pend = {}, saveT = null, storeOk = true, ui = {};
  var TABS = [['inicio', 'Inicio', 'home'], ['plan', 'Plan', 'percentage'], ['deudas', 'Deudas', 'list'], ['fijos', 'Gastos', 'calendar'], ['ahorro', 'Ahorro', 'coin']];
  var XCH = ['Curso', 'Arreglo', 'Regalo', 'Salud', 'Viaje', 'Compra grande'];
  var CH = ['Alquiler', 'Servicios', 'Internet y celular', 'Transporte', 'Salud', 'Educación'];
  var IC = {
    home: '<path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/>',
    percentage: '<circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/><path d="M6 18L18 6"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M5 6v.01M5 12v.01M5 18v.01"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2 0 0 0 -2.5 -1h-.5a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4h-.5a2.5 2 0 0 1 -2.5 -1M12 6.5v1.5M12 16v1.5"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>',
    alert: '<path d="M12 9v4M12 16v.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7 -3L13.7 3.9a2 2 0 0 0 -3.4 0z"/>',
    check: '<path d="M5 12l5 5l10 -10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    circleCheck: '<circle cx="12" cy="12" r="9"/><path d="M9 12l2 2l4 -4"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6 -3.6M8.2 13.2l7.6 3.6"/>'
  };

  // ---------- utilidades ----------
  var $ = function (s) { return document.querySelector(s); };
  var money = P.fmt;
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var amt = function (v) { v = String(v).replace(/,\d{1,2}$/, ''); var n = parseInt(v.replace(/\D/g, ''), 10); return isFinite(n) && n > 0 ? n : 0; };
  var rateTxt = function (r) { return String(r).replace('.', ','); };
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  var dateTxt = function (ts) { var d = new Date(ts); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); };
  var find = function (list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; };
  var sum = P.sum;
  function ic(n, s, c) { return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (c ? ' style="color:' + c + '"' : '') + '>' + IC[n] + '</svg>'; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } }
  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
  function resetUi() { ui = { panel: null, form: null, del: null, fform: null, fdel: null, sub: 'fijos', xform: null, xdel: null, aform: false, imp: null, rst: false, det: ui.det || false }; }
  resetUi();

  // ---------- guardado e historial ----------
  function persist() { ST.save(S); }
  function commit(t, d) { P.logEv(S, t, d); persist(); }
  function softSave() { clearTimeout(saveT); saveT = setTimeout(persist, 400); }
  // Cambios que se hacen de a muchos toques (porcentajes, ingreso) se anotan juntos como un solo movimiento.
  function coalesce(key, t, before, after) {
    var p = pend[key]; if (!p) p = pend[key] = { t: t, before: before };
    p.after = after; clearTimeout(p.timer); p.timer = setTimeout(function () { flush(key); }, 1200); softSave();
  }
  function flush(key) {
    var p = pend[key]; if (!p) return;
    clearTimeout(p.timer); delete pend[key];
    if (JSON.stringify(p.before) !== JSON.stringify(p.after)) P.logEv(S, p.t, { antes: p.before, despues: p.after });
    persist();
  }
  function flushAll() { Object.keys(pend).forEach(flush); clearTimeout(saveT); if (S) persist(); }
  function syncGoal() {
    if (S.goal > 0 && S.saved >= S.goal) { if (!S.goalHit) { S.goalHit = true; commit('meta_alcanzada', { colchon: S.saved, meta: S.goal }); return true; } }
    else S.goalHit = false;
    return false;
  }
  function sharesMap() { var o = {}; S.debts.filter(P.isAct).forEach(function (d) { o[d.n] = d.share; }); return o; }
  function resplit(motivo) { var a = sharesMap(); P.suggest(S); commit('reparto', { motivo: motivo, antes: a, despues: sharesMap() }); }
  var dsnap = function (d) { return { n: d.n, b: d.b, min: d.min, rate: d.rate, due: d.due, late: d.late, paid: d.paid }; };

  // ---------- avisos en pantalla ----------
  function toast(msg, withUndo) {
    var el = $('#toast'); clearTimeout(toastT);
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (withUndo ? '<button data-a="undo">Deshacer</button>' : '');
    el.hidden = false;
    toastT = setTimeout(function () { el.hidden = true; undoInfo = null; }, withUndo ? 9000 : 4000);
  }
  function hideToast() { clearTimeout(toastT); $('#toast').hidden = true; }
  function fail(m) { var e = $('#err'); if (!e) return; e.textContent = m; e.hidden = false; }

  // ---------- Inicio ----------
  function panelHtml() {
    if (!ui.panel) return '';
    var h = '<div class="card col" style="gap:10px" id="panel">';
    if (ui.panel === 'pay') {
      var act = S.debts.filter(function (d) { return d.b > 0; });
      h += '<label class="lbl13" for="f-debt">¿Cuál pagaste?</label><select id="f-debt">' + act.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.n) + '</option>'; }).join('') + '</select><label class="lbl13" for="f-amt">¿Cuánto?</label><input id="f-amt" type="text" inputmode="numeric" data-money placeholder="$ 20.000" autocomplete="off">';
    } else {
      h += '<label class="lbl13" for="f-amt">¿Cuánto apartaste?</label><input id="f-amt" type="text" inputmode="numeric" data-money placeholder="$ 15.000" autocomplete="off">';
    }
    return h + '<p id="err" style="font-size:13px;color:var(--bad)" hidden></p><div class="g2" style="gap:8px"><button class="mk-btn pri" data-a="ok">Guardar</button><button class="mk-btn" data-a="no">Cancelar</button></div></div>';
  }
  function dueTag(d) {
    var li = P.lateInfo(S, C, d, new Date()); if (!li) return '';
    if (li.over) return ' · <span style="color:var(--bad);font-weight:600">vencida</span>';
    if (li.dd <= 5) return ' · <span style="color:var(--warn);font-weight:600">vence ' + P.whenText(li.dd) + '</span>';
    return '';
  }
  function dueHtml(d) {
    var li = P.lateInfo(S, C, d, new Date()); if (!li || (!li.over && li.dd > 5)) return '';
    var bad = li.over, txt;
    if (bad) txt = 'Venció el día ' + d.due + '. Faltan ' + money(li.left) + ' del pago del mes' + (li.extra > 0 ? '. Con el recargo estimado serían ' + money(li.left + li.extra) + '.' : '.');
    else txt = 'Vence ' + P.whenText(li.dd) + '. Faltan ' + money(li.left) + (li.extra > 0 ? '. Si se pasa la fecha, el recargo estimado es ' + money(li.extra) + '.' : '.');
    return '<p style="font-size:13px;padding:8px 10px;border-radius:10px;background:' + (bad ? 'var(--bad-bg)' : 'var(--warn-bg)') + ';color:' + (bad ? 'var(--bad)' : 'var(--warn)') + '">' + esc(txt) + '</p>';
  }
  function alertsHtml() {
    var L = P.alerts(S, C, new Date());
    if (!L.length) return S.income > 0 ? '<div class="card" style="display:flex;gap:10px;align-items:center">' + ic('circleCheck', 22, 'var(--good)') + '<span>Todo al día este mes</span></div>' : '';
    return '<div class="col" style="gap:8px">' + L.map(function (a) {
      var bad = a.lv === 'bad';
      return '<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;background:' + (bad ? 'var(--bad-bg)' : 'var(--warn-bg)') + ';color:' + (bad ? 'var(--bad)' : 'var(--warn)') + '">' + ic('alert', 20) + '<div style="flex:1;min-width:0;font-size:14px">' + esc(a.t) + (a.al ? '<button class="lnk" style="color:inherit;text-decoration:underline;display:block;padding:4px 0 0" data-a="' + a.a + '"' + (a.d ? ' data-t="' + a.d + '"' : '') + '>' + a.al + '</button>' : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function noticesHtml() {
    var h = '';
    if (!storeOk) h += '<div class="card" style="background:var(--bad-bg);color:var(--bad)"><p style="font-weight:600">No se pudo guardar en este celular</p><p class="mk-sub" style="color:inherit">Guardá una copia ahora para no perder lo que cargaste.</p><button class="mk-btn sm" style="margin-top:8px" data-a="backup">Guardar copia</button></div>';
    if (isIOS() && !standalone() && !lsGet('pdd:hint')) h += '<div class="card banner"><p style="font-weight:600">Instalala en tu iPhone</p><p class="mk-sub" style="font-size:13px;margin-top:4px">Tocá Compartir (el cuadrado con la flecha) y después "Agregar a inicio". Hacelo antes de cargar tus datos: lo que cargues en Safari no pasa a la app instalada.</p><button class="mk-btn sm" style="margin-top:8px" data-a="hint">Entendido</button></div>';
    if (S.demo) h += '<div class="card banner"><p style="font-weight:600">Datos de ejemplo</p><p class="mk-sub" style="font-size:13px;margin-top:4px">Editá estos datos o borrá todo para empezar con los tuyos.</p><div class="g2" style="gap:8px;margin-top:8px"><button class="mk-btn sm" data-a="clearDemo">Borrar ejemplos</button><button class="mk-btn sm" data-a="hideDemo">Ocultar</button></div></div>';
    if (S.flash && S.flash.interest > 0) h += '<div class="card banner"><p style="font-weight:600">Empezó ' + P.monthName(S.month) + '</p><p class="mk-sub" style="font-size:13px;margin-top:4px">Se sumaron unos ' + money(S.flash.interest) + ' de intereses estimados a tus deudas. Si tu resumen dice otro saldo, corregilo en Deudas.</p><button class="mk-btn sm" style="margin-top:8px" data-a="flash">Entendido</button></div>';
    return h;
  }
  function etaText(tot, sim) {
    if (tot <= 0) return 'Sin deudas';
    if (S.income <= 0) return 'Cargá lo que cobraste para calcular cuándo terminás';
    return sim.ok ? 'Libre en unos ' + sim.months + (sim.months === 1 ? ' mes' : ' meses') : 'No alcanza para los intereses';
  }
  function barLbl(v) { return v < 500 ? '0' : v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' M' : Math.round(v / 1000) + ' mil'; }
  function backupHtml() {
    var last = S.lastBackup ? dateTxt(S.lastBackup) : 'todavía no guardaste una';
    var h = '<div class="card col" style="gap:10px"><p style="font-weight:600">Compartir resumen</p><p class="mk-sub" style="font-size:13px">Se envía el resumen del mes y el historial completo de todo lo que cargaste. La app nunca manda nada sola.</p><button class="mk-btn pri" data-a="share">' + ic('share', 18) + 'Compartir resumen</button></div>';
    h += '<details class="card" id="bk"' + (ui.det ? ' open' : '') + '><summary>Copia de seguridad y datos</summary><div class="col" style="gap:10px;margin-top:10px"><p class="mk-sub" style="font-size:13px">Tus datos están solo en este celular. Última copia: ' + last + '. El archivo de "Compartir resumen" también sirve como copia.</p><button class="mk-btn sm" data-a="backup">Guardar copia</button><label class="mk-btn sm" for="impfile" role="button">Restaurar copia</label><input class="sr" id="impfile" type="file" accept=".csv,text/csv,text/plain" tabindex="-1">';
    if (ui.imp) h += '<div class="notice" style="margin:0"><p>Copia del ' + dateTxt(ui.imp.S.updatedAt || Date.now()) + ': ' + ui.imp.S.debts.length + (ui.imp.S.debts.length === 1 ? ' deuda' : ' deudas') + ', deuda total ' + money(sum(ui.imp.S.debts, function (d) { return d.b; })) + '. Reemplaza todo lo que hay ahora.</p><div class="g2" style="gap:8px;margin-top:8px"><button class="mk-btn sm danger" data-a="impyes">Sí, restaurar</button><button class="mk-btn sm" data-a="impno">Cancelar</button></div></div>';
    if (ui.impErr) h += '<p class="notice" style="margin:0">' + esc(ui.impErr) + '</p>';
    if (ui.rst) h += '<div class="notice" style="margin:0"><p>Se borra todo: deudas, gastos, ahorro e historial. ¿Guardaste una copia?</p><div class="col" style="gap:8px;margin-top:8px"><button class="mk-btn sm" data-a="backup">Guardar copia primero</button><button class="mk-btn sm danger" data-a="rstyes">Sí, borrar todo</button><button class="mk-btn sm" data-a="rstno">Cancelar</button></div></div>';
    else h += '<button class="mk-btn sm" data-a="rst">Empezar de cero</button>';
    return h + '</div></details><p class="ver">Versión ' + VERSION + '</p>';
  }
  function vInicio() {
    C = P.calc(S);
    var tot = sum(S.debts, function (d) { return d.b; }), T = C.T, Pd = C.Pd;
    var prev = S.hist.length ? S.hist[S.hist.length - 1].total : null;
    var h = '<div class="g2" style="gap:8px"><button class="mk-btn pri" data-a="pay">' + ic('check', 18) + 'Pagué</button><button class="mk-btn" data-a="save">' + ic('coin', 18) + 'Aparté</button></div>' + panelHtml();
    h += noticesHtml() + alertsHtml();
    if (!S.debts.length) h += '<div class="card"><p>Todavía no cargaste deudas.</p><p class="mk-sub">Empezá por la primera: con eso ya se arma el plan.</p><button class="mk-btn sm" style="margin-top:10px" data-a="tab" data-t="deudas">Ir a Deudas</button></div>';
    else {
      var sim = P.simulate(S, C), delta = prev !== null ? tot - prev : 0;
      var hs = S.hist.slice(-3);
      var series = hs.map(function (x) { return { v: x.total, l: P.shortName(x.m) }; }).concat([{ v: tot, l: P.shortName(S.month), cur: true }]);
      var proj = (sim.ok && tot > 0 && S.income > 0) ? sim.series.slice(0, 3).map(function (v, j) { return { v: v, l: P.shortName(P.monthAdd(S.month, j + 1)), pr: true }; }) : [];
      var all = series.concat(proj), mx = Math.max.apply(null, all.map(function (x) { return x.v; })) || 1;
      var dif = hs.length ? hs[0].total - tot : 0, pc = hs.length && hs[0].total > 0 ? Math.round(dif / hs[0].total * 100) : 0;
      var bar = function (x) {
        var bh = Math.max(4, Math.round(x.v / mx * 64));
        return '<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px"><span class="bl">' + barLbl(x.v) + '</span><div style="width:100%;height:' + bh + 'px;border-radius:3px;background:' + (x.pr || x.cur ? 'var(--accent)' : 'var(--faint)') + (x.pr ? ';opacity:.4' : '') + '"></div><span style="font-size:11px;color:var(--muted)">' + x.l + '</span></div>';
      };
      h += '<div class="card"><p class="mk-lbl">Tu deuda</p><p class="mk-big">' + money(tot) + '</p>' +
        (prev !== null ? '<p style="font-size:13px;font-weight:600;margin-top:2px;color:' + (delta <= 0 ? 'var(--good)' : 'var(--warn)') + '">' + (delta < 0 ? '↓ Bajó ' + money(-delta) + ' desde el cierre del mes pasado' : delta > 0 ? '↑ Subió ' + money(delta) + ' (intereses y cambios)' : 'Sin cambios desde el mes pasado') + '</p>' : '') +
        '<p class="mk-sub">' + etaText(tot, sim) + '</p>' +
        (dif > 0 ? '<div class="mk-bar"><i style="width:' + Math.min(100, pc) + '%;background:var(--good)"></i></div><p class="mk-sub">Bajaste ' + money(dif) + ' desde el cierre de ' + P.monthName(hs[0].m) + ' (' + pc + '%)</p>' : '') +
        (tot > 0 || hs.length ? '<div style="display:flex;align-items:flex-end;gap:6px;height:104px;margin-top:12px">' + all.map(bar).join('') + '</div>' : '') +
        (proj.length ? '<p class="mk-sub" style="margin-top:8px">Las barras claras muestran cómo bajaría si seguís el plan.</p>' : '') + '</div>';
      h += '<div class="card"><p class="mk-lbl">Pago propuesto de ' + P.monthName(S.month) + '</p><p class="mk-big">' + money(Pd) + ' de ' + money(T) + '</p><div class="mk-bar"><i style="width:' + (T > 0 ? Math.min(100, Math.round(Pd / T * 100)) : 100) + '%;background:var(--accent)"></i></div><p class="mk-sub">' + (T - Pd > 0 ? 'Te faltan ' + money(T - Pd) + ' para cerrar el mes' : 'Mes cumplido') + '</p><div class="col" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">' +
        S.debts.map(function (d) {
          var t = C.t[d.id], ok = t > 0 && d.paid >= t, gone = d.b === 0 && t === 0;
          return '<div class="mk-row">' + ((ok || gone) ? ic('circleCheck', 22, 'var(--good)') : ic('circle', 22, 'var(--faint)')) + '<span class="nm">' + esc(d.n) + '<span class="sm">' + (gone ? 'Saldada' : 'Pagaste ' + money(Math.min(d.paid, t)) + ' de ' + money(t)) + dueTag(d) + '</span></span></div>';
        }).join('') + '</div></div>';
    }
    if (S.income > 0) {
      var segs = [['Deudas', C.T, 'var(--accent)'], ['Ahorro', C.sAmt, 'var(--good)'], ['Gastos fijos', C.fixedTotal, 'var(--faint)'], ['Extras', C.extraTotal, 'var(--extra)'], ['Libre', Math.max(0, C.free), 'var(--sun)']].filter(function (x) { return x[1] > 0; });
      var sm = sum(segs, function (x) { return x[1]; }) || 1;
      h += '<div class="card"><p class="mk-lbl">A dónde va lo que cobraste</p><p class="mk-big">' + money(S.income) + '</p><div style="display:flex;height:14px;border-radius:7px;overflow:hidden;margin-top:10px;gap:2px">' + segs.map(function (x) { return '<div style="width:' + (x[1] / sm * 100) + '%;background:' + x[2] + '"></div>'; }).join('') + '</div><div class="legend">' + segs.map(function (x) { return '<div style="display:flex;align-items:center;gap:8px;font-size:13px;min-width:0"><span style="width:10px;height:10px;border-radius:50%;background:' + x[2] + ';flex:none"></span><span style="flex:1;min-width:0;color:var(--muted)">' + x[0] + '</span><span style="font-weight:600;font-variant-numeric:tabular-nums">' + money(x[1]) + '</span></div>'; }).join('') + '</div><button class="lnk" style="margin-top:8px;padding-left:0" data-a="xgo">Anotar un gasto extra</button></div>';
    }
    var cp = S.goal > 0 ? Math.min(100, Math.round(S.saved / S.goal * 100)) : 0;
    h += '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><span class="mk-lbl">Colchón de emergencia</span>' + (S.goal > 0 ? '<span style="font-size:13px;font-weight:600">' + cp + '%</span>' : '') + '</div><p class="mk-big">' + money(S.saved) + '</p><div class="mk-bar"><i style="width:' + cp + '%;background:var(--good)"></i></div><p class="mk-sub">' + (S.goal > 0 ? 'Meta ' + money(S.goal) + (C.sAmt > 0 ? ' · este mes apartaste ' + money(S.savedMonth) + ' de ' + money(C.sAmt) : '') : 'Todavía no definiste una meta. Podés hacerlo en Ahorro.') + '</p></div>';
    return h + backupHtml();
  }

  // ---------- Plan ----------
  function pctCtl(k, v) {
    return '<span class="pc"><button class="st" data-a="step" data-k="' + k + '" data-d="-1" aria-label="Bajar porcentaje">−</button><span class="pcw"><input class="pcin" type="text" inputmode="numeric" data-pct="' + k + '" value="' + v + '" aria-label="Porcentaje"><span>%</span></span><button class="st" data-a="step" data-k="' + k + '" data-d="1" aria-label="Subir porcentaje">+</button></span>';
  }
  function planBox() {
    C = P.calc(S);
    var inc = S.income, h = '<p style="font-weight:600;margin-bottom:10px">Cómo se reparte ' + P.monthName(S.month) + '</p><div class="col" style="gap:10px">';
    h += '<div class="pl"><span>Deudas</span>' + pctCtl('dp', S.dp) + '<span class="amt">' + money(C.T) + '</span></div>';
    h += '<div class="pl"><span>Ahorro</span>' + (C.full ? '<span class="pc"><span style="min-width:0;font-weight:400;color:var(--muted)">Completo</span></span>' : pctCtl('sp', S.sp)) + '<span class="amt">' + money(C.sAmt) + '</span></div>';
    h += '<div class="pl"><span>Gastos fijos <button class="lnk" data-a="tab" data-t="fijos">Editar</button></span><span class="pc"><span>' + (inc > 0 ? Math.round(C.fixedTotal / inc * 100) : 0) + '%</span></span><span class="amt">' + money(C.fixedTotal) + '</span></div>';
    h += '<div class="pl"><span>Gastos extras <button class="lnk" data-a="xgo">' + (C.extraTotal > 0 ? 'Editar' : 'Agregar') + '</button></span><span class="pc"><span>' + (inc > 0 ? Math.round(C.extraTotal / inc * 100) : 0) + '%</span></span><span class="amt">' + money(C.extraTotal) + '</span></div>';
    h += '<div class="pl"><span>Libre para vivir</span><span class="pc"><span>' + (inc > 0 ? Math.round(C.free / inc * 100) : 0) + '%</span></span><span class="amt" style="color:' + (C.free < 0 ? 'var(--bad)' : 'var(--fg)') + '">' + money(C.free) + '</span></div></div>';
    if (C.free < 0 && inc > 0) h += '<p class="notice">Los gastos fijos, los extras y el plan superan lo que cobraste por ' + money(-C.free) + '. Bajá el porcentaje de deudas o de ahorro, o revisá los gastos.</p>';
    if (inc <= 0) h += '<p class="mk-sub" style="margin-top:10px">Cargá lo que cobraste para calcular el plan.</p>';
    if (C.short) h += '<p class="notice">El ' + S.dp + '% no alcanza para los mínimos (' + money(C.sumMin) + '). Se usa ese monto.</p>';
    if (C.full) h += '<p class="mk-sub" style="margin-top:10px">El colchón llegó a la meta: el porcentaje de ahorro pasa a deudas.</p>';
    return h + '<p class="mk-sub" style="margin-top:10px">El monto de deudas se divide entre cada una en el cuadro de abajo.</p>';
  }
  function divBox() {
    C = P.calc(S);
    var act = S.debts.filter(P.isAct);
    if (!act.length) return '<p class="mk-sub">No hay deudas para repartir.</p>';
    var h = '<p style="font-weight:600">Cómo se divide el pago de deudas</p><p class="mk-sub" style="margin-bottom:10px">Los porcentajes suman 100%. Lo que le sumás a una se lo sacás a otra.</p><div class="col" style="gap:12px">';
    act.forEach(function (d) {
      var ctl = act.length > 1 ? '<span class="pc"><button class="st" data-a="sh" data-i="' + esc(d.id) + '" data-d="-5" aria-label="Bajar porcentaje de ' + esc(d.n) + '">−</button><span>' + d.share + '%</span><button class="st" data-a="sh" data-i="' + esc(d.id) + '" data-d="5" aria-label="Subir porcentaje de ' + esc(d.n) + '">+</button></span>' : '<span class="pc"><span>100%</span></span>';
      h += '<div class="pl"><span style="min-width:0;overflow-wrap:anywhere">' + esc(d.n) + '<span style="display:block;font-size:12px;color:var(--muted)">' + (d.rate ? 'Interés ' + rateTxt(d.rate) + '% por mes' : 'Sin interés') + (C.floor[d.id] ? ' · usa su mínimo' : '') + '</span></span>' + ctl + '<span class="amt">' + money(C.t[d.id]) + '</span></div>';
    });
    h += '</div><button class="mk-btn sm" style="margin-top:12px" data-a="suggest">Sugerir reparto según intereses</button><p class="mk-sub" style="margin-top:6px">Primero los mínimos; lo que sobra va a la de mayor interés.</p>';
    var r = P.simulate(S, C);
    if (S.income > 0) {
      if (r.ok && r.months > 0) h += '<p class="mk-sub" style="margin-top:10px">Con este reparto terminás en unos ' + r.months + (r.months === 1 ? ' mes' : ' meses') + ' y pagás unos ' + money(r.interest) + ' de intereses.</p>';
      else if (!r.ok) h += '<p class="notice">Con este monto no se llega a cubrir los intereses. Subí el porcentaje de deudas.</p>';
    }
    if (C.T > C.monthly) h += '<p class="mk-sub" style="margin-top:6px">Algunas usan su mínimo, por eso el total del mes sube a ' + money(C.T) + '.</p>';
    return h;
  }
  function refreshPlan() { var a = $('#planBox'), b = $('#divBox'); if (a) a.innerHTML = planBox(); if (b) b.innerHTML = divBox(); }
  function vPlan() {
    var prevChip = S.prevIncome > 0 && !S.income ? '<button class="chip" style="margin-top:8px" data-a="useprev">Usar lo del mes pasado (' + money(S.prevIncome) + ')</button>' : '';
    return '<div class="card"><label class="mk-lbl" for="inc">Lo que cobraste este mes</label><input id="inc" type="text" inputmode="numeric" data-money value="' + P.fmtNum(S.income) + '" placeholder="$" style="margin-top:6px" autocomplete="off"><p class="mk-sub">El sueldo cambia cada mes: cargá el total y el plan se recalcula.</p>' + prevChip + '</div><div class="card" id="planBox">' + planBox() + '</div><div class="card" id="divBox">' + divBox() + '</div>';
  }

  // ---------- Deudas ----------
  function vDeudas() {
    C = P.calc(S);
    var h = '';
    if (ui.form) {
      var ed = ui.form.id ? find(S.debts, ui.form.id) : null;
      var d = ed || { n: '', b: '', min: '', rate: 0, rt: 'm', rv: 0, due: '', late: '', paid: 0 };
      var rt = d.rt || 'm', rv = d.rv || d.rate || '';
      h += '<div class="card col" style="gap:10px"><p style="font-weight:600">' + (ed ? 'Editar deuda' : 'Nueva deuda') + '</p><label class="lbl13" for="f-name">¿A quién le debés?</label><input id="f-name" type="text" maxlength="80" placeholder="Ej: Tarjeta Visa" value="' + esc(d.n) + '" autocomplete="off"><label class="lbl13" for="f-amt">¿Cuánto debés hoy?</label><input id="f-amt" type="text" inputmode="numeric" data-money placeholder="$ 50.000" value="' + P.fmtNum(d.b) + '" autocomplete="off">' +
        (ed ? '<label class="lbl13" for="f-paid">Lo que ya pagaste este mes</label><input id="f-paid" type="text" inputmode="numeric" data-money placeholder="$ 0" value="' + P.fmtNum(d.paid) + '" autocomplete="off">' : '') +
        '<label class="lbl13" for="f-min">Pago mínimo por mes (opcional)</label><input id="f-min" type="text" inputmode="numeric" data-money placeholder="$ 5.000" value="' + P.fmtNum(d.min) + '" autocomplete="off"><p class="mk-sub">Si lo dejás vacío se usa el 10% de lo que debés.</p>' +
        '<label class="lbl13" for="f-rtype">Interés (opcional): ¿qué dato te da el banco?</label><select id="f-rtype"><option value="m"' + (rt === 'm' ? ' selected' : '') + '>Interés por mes</option><option value="tna"' + (rt === 'tna' ? ' selected' : '') + '>TNA (anual)</option><option value="tea"' + (rt === 'tea' ? ' selected' : '') + '>TEA (anual efectiva)</option></select><input id="f-rate" type="text" inputmode="decimal" placeholder="Ej: 6" value="' + (rv ? rateTxt(rv) : '') + '" aria-label="Porcentaje de interés" autocomplete="off"><p class="mk-sub" id="rate-out">El banco suele informar TNA o TEA. Elegí cuál y se convierte a interés por mes.</p>' +
        '<label class="lbl13" for="f-due">Día de vencimiento (opcional)</label><input id="f-due" type="text" inputmode="numeric" placeholder="1 a 31" value="' + (d.due || '') + '" autocomplete="off"><label class="lbl13" for="f-late">Recargo si se paga tarde, en % (opcional)</label><input id="f-late" type="text" inputmode="decimal" placeholder="Ej: 10" value="' + (d.late ? rateTxt(d.late) : '') + '" autocomplete="off"><p class="mk-sub">Es una estimación sobre lo que falte pagar. El monto real lo informa el banco en el resumen.</p><p id="err" style="font-size:13px;color:var(--bad)" hidden></p><div class="g2" style="gap:8px"><button class="mk-btn pri" data-a="saveform">Guardar</button><button class="mk-btn" data-a="cancelform">Cancelar</button></div></div>';
    }
    if (!S.debts.length && !ui.form) h += '<div class="card"><p>Todavía no cargaste deudas.</p><p class="mk-sub">Agregá la primera para ver cuándo terminás.</p></div>';
    S.debts.forEach(function (d) {
      h += '<div class="card col" style="gap:8px"><div style="display:flex;justify-content:space-between;gap:8px"><span style="min-width:0;overflow-wrap:anywhere;font-weight:600">' + esc(d.n) + '</span><span style="white-space:nowrap;font-weight:600;font-variant-numeric:tabular-nums">' + (d.b > 0 ? money(d.b) : 'Saldada') + '</span></div><p class="mk-sub" style="margin:0">Mínimo ' + money(d.min) + ' por mes · ' + (d.rate ? 'interés ' + rateTxt(d.rate) + '% (unos ' + money(d.b * d.rate / 100) + ' al mes)' : 'sin interés') + (d.due ? ' · vence el día ' + d.due : '') + ' · pagaste ' + money(d.paid) + ' este mes</p>' + dueHtml(d);
      if (ui.del === d.id) h += '<div class="g2" style="gap:8px"><button class="mk-btn sm danger" data-a="delyes" data-i="' + esc(d.id) + '">Sí, borrar</button><button class="mk-btn sm" data-a="delno">No</button></div>';
      else h += '<div class="g2" style="gap:8px"><button class="mk-btn sm" data-a="edit" data-i="' + esc(d.id) + '">Editar</button><button class="mk-btn sm" data-a="del" data-i="' + esc(d.id) + '">Borrar</button></div>';
      h += '</div>';
    });
    if (!ui.form) h += '<button class="mk-btn" data-a="new">' + ic('plus', 18) + 'Nueva deuda</button><p class="mk-sub" style="text-align:center">Cuando te llegue un resumen, corregí el saldo con Editar.</p>';
    return h;
  }
  function rateOut() {
    var el = $('#rate-out'); if (!el) return;
    var v = parseFloat(String($('#f-rate').value).replace(',', '.')), t = $('#f-rtype').value;
    if (!isFinite(v) || v <= 0) { el.textContent = 'El banco suele informar TNA o TEA. Elegí cuál y se convierte a interés por mes.'; return; }
    el.textContent = (t === 'm' ? 'Se usa ' : 'Equivale a ') + rateTxt(P.toMonthly(t, v)) + '% por mes.';
  }

  // ---------- Gastos ----------
  function vFijos() {
    C = P.calc(S);
    var h = '<div class="card"><p class="mk-lbl">Gastos fijos por mes</p><p class="mk-big">' + money(C.fixedTotal) + '</p><p class="mk-sub">' + S.fixed.length + (S.fixed.length === 1 ? ' gasto' : ' gastos') + (S.income > 0 ? ' · ' + Math.round(C.fixedTotal / S.income * 100) + '% de lo que cobraste' : '') + '</p></div>';
    if (ui.fform) {
      var ed = ui.fform.id ? find(S.fixed, ui.fform.id) : null, f = ed || { n: '', a: '' };
      h += '<div class="card col" style="gap:10px"><p style="font-weight:600">' + (ed ? 'Editar gasto fijo' : 'Nuevo gasto fijo') + '</p><label class="lbl13" for="f-fname">¿Qué es?</label><input id="f-fname" type="text" maxlength="80" placeholder="Ej: Alquiler" value="' + esc(f.n) + '" autocomplete="off"><div style="display:flex;flex-wrap:wrap;gap:6px">' + CH.map(function (c) { return '<button class="chip" data-a="chip" data-n="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div><label class="lbl13" for="f-famt">¿Cuánto por mes?</label><input id="f-famt" type="text" inputmode="numeric" data-money placeholder="$ 50.000" value="' + P.fmtNum(f.a) + '" autocomplete="off"><p class="mk-sub">Si se paga una vez al año, dividilo por 12.</p><p id="err" style="font-size:13px;color:var(--bad)" hidden></p><div class="g2" style="gap:8px"><button class="mk-btn pri" data-a="fsave">Guardar</button><button class="mk-btn" data-a="fcancel">Cancelar</button></div></div>';
    }
    if (!S.fixed.length && !ui.fform) h += '<div class="card"><p>Todavía no cargaste gastos fijos.</p><p class="mk-sub">Alquiler, servicios, transporte: lo que pagás todos los meses.</p></div>';
    S.fixed.forEach(function (f) {
      h += '<div class="card col" style="gap:8px"><div style="display:flex;justify-content:space-between;gap:8px"><span style="min-width:0;overflow-wrap:anywhere;font-weight:600">' + esc(f.n) + '</span><span style="white-space:nowrap;font-weight:600;font-variant-numeric:tabular-nums">' + money(f.a) + '</span></div>';
      if (ui.fdel === f.id) h += '<div class="g2" style="gap:8px"><button class="mk-btn sm danger" data-a="fdelyes" data-i="' + esc(f.id) + '">Sí, borrar</button><button class="mk-btn sm" data-a="fdelno">No</button></div>';
      else h += '<div class="g2" style="gap:8px"><button class="mk-btn sm" data-a="fedit" data-i="' + esc(f.id) + '">Editar</button><button class="mk-btn sm" data-a="fdel" data-i="' + esc(f.id) + '">Borrar</button></div>';
      h += '</div>';
    });
    if (!ui.fform) h += '<button class="mk-btn" data-a="fnew">' + ic('plus', 18) + 'Nuevo gasto fijo</button>';
    return h;
  }
  function vExtras() {
    C = P.calc(S);
    var cur = S.extras.filter(function (e) { return P.monthKey(new Date(e.ts)) === S.month; });
    var h = '<div class="card"><p class="mk-lbl">Extras de ' + P.monthName(S.month) + '</p><p class="mk-big">' + money(C.extraTotal) + '</p><p class="mk-sub">' + cur.length + (cur.length === 1 ? ' gasto' : ' gastos') + (S.income > 0 ? ' · ' + Math.round(C.extraTotal / S.income * 100) + '% de lo que cobraste' : '') + '</p><p class="mk-sub" style="margin-top:8px">Anotá solo los gastos grandes que no se repiten, como un curso o un arreglo. No hace falta anotar cada compra.</p></div>';
    if (ui.xform) {
      var ed = ui.xform.id ? find(S.extras, ui.xform.id) : null, f = ed || { n: '', a: '' };
      h += '<div class="card col" style="gap:10px"><p style="font-weight:600">' + (ed ? 'Editar gasto extra' : 'Nuevo gasto extra') + '</p><label class="lbl13" for="f-xname">¿Qué es?</label><input id="f-xname" type="text" maxlength="80" placeholder="Ej: Curso de inglés" value="' + esc(f.n) + '" autocomplete="off"><div style="display:flex;flex-wrap:wrap;gap:6px">' + XCH.map(function (c) { return '<button class="chip" data-a="chip" data-x="1" data-n="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div><label class="lbl13" for="f-xamt">¿Cuánto fue?</label><input id="f-xamt" type="text" inputmode="numeric" data-money placeholder="$ 35.000" value="' + P.fmtNum(f.a) + '" autocomplete="off"><p id="err" style="font-size:13px;color:var(--bad)" hidden></p><div class="g2" style="gap:8px"><button class="mk-btn pri" data-a="xsave">Guardar</button><button class="mk-btn" data-a="xcancel">Cancelar</button></div></div>';
    }
    if (!cur.length && !ui.xform) h += '<div class="card"><p>No hay gastos extras este mes.</p><p class="mk-sub">Si hacés una compra grande, anotala acá para que el plan la tenga en cuenta.</p></div>';
    cur.forEach(function (e) {
      h += '<div class="card col" style="gap:8px"><div style="display:flex;justify-content:space-between;gap:8px"><span style="min-width:0;overflow-wrap:anywhere;font-weight:600">' + esc(e.n) + '<span style="display:block;font-size:12px;font-weight:400;color:var(--muted)">' + new Date(e.ts).getDate() + ' de ' + P.monthName(P.monthKey(new Date(e.ts))) + '</span></span><span style="white-space:nowrap;font-weight:600;font-variant-numeric:tabular-nums">' + money(e.a) + '</span></div>';
      if (ui.xdel === e.id) h += '<div class="g2" style="gap:8px"><button class="mk-btn sm danger" data-a="xdelyes" data-i="' + esc(e.id) + '">Sí, borrar</button><button class="mk-btn sm" data-a="xdelno">No</button></div>';
      else h += '<div class="g2" style="gap:8px"><button class="mk-btn sm" data-a="xedit" data-i="' + esc(e.id) + '">Editar</button><button class="mk-btn sm" data-a="xdel" data-i="' + esc(e.id) + '">Borrar</button></div>';
      h += '</div>';
    });
    if (!ui.xform) h += '<button class="mk-btn" data-a="xnew">' + ic('plus', 18) + 'Nuevo gasto extra</button>';
    return h;
  }
  function vGastos() {
    var sub = ui.sub || 'fijos';
    return '<div class="seg" role="group" aria-label="Tipo de gasto"><button data-a="sub" data-s="fijos" aria-pressed="' + (sub === 'fijos') + '">Fijos</button><button data-a="sub" data-s="extras" aria-pressed="' + (sub === 'extras') + '">Extras</button></div>' + (sub === 'fijos' ? vFijos() : vExtras());
  }

  // ---------- Ahorro ----------
  function vAhorro() {
    C = P.calc(S);
    var p = S.goal > 0 ? Math.min(100, Math.round(S.saved / S.goal * 100)) : 0;
    var h = '<div class="card"><p class="mk-lbl">Colchón de emergencia</p><p class="mk-big">' + money(S.saved) + '</p><div class="mk-bar"><i style="width:' + p + '%;background:var(--good)"></i></div><p class="mk-sub">' + (S.goal > 0 ? p + '% de la meta' : 'Definí una meta para ver el avance') + '</p></div>';
    h += '<div class="card"><label class="mk-lbl" for="goalin">Meta del colchón</label><input id="goalin" type="text" inputmode="numeric" data-money value="' + P.fmtNum(S.goal) + '" placeholder="$" style="margin-top:6px" autocomplete="off"><p class="mk-sub">Una buena primera meta es un mes de gastos fijos' + (C.fixedTotal > 0 ? ' (hoy: ' + money(C.fixedTotal) + ')' : '') + '.</p></div>';
    h += '<div class="card"><p class="mk-lbl">Este mes</p><p class="mk-big">' + money(S.savedMonth) + (C.sAmt > 0 ? ' de ' + money(C.sAmt) : '') + '</p>' + (C.full ? '<p class="mk-sub">El colchón llegó a la meta: el ahorro pasa a deudas.</p>' : '') + '</div>';
    h += '<button class="mk-btn pri" data-a="save">' + ic('coin', 18) + 'Aparté</button>' + panelHtml();
    if (ui.aform) h += '<div class="card col" style="gap:10px"><p style="font-weight:600">Corregir montos</p><label class="lbl13" for="f-saved">Colchón total</label><input id="f-saved" type="text" inputmode="numeric" data-money value="' + P.fmtNum(S.saved) + '" placeholder="$ 0" autocomplete="off"><label class="lbl13" for="f-sm">Apartado este mes</label><input id="f-sm" type="text" inputmode="numeric" data-money value="' + P.fmtNum(S.savedMonth) + '" placeholder="$ 0" autocomplete="off"><div class="g2" style="gap:8px"><button class="mk-btn pri" data-a="asave">Guardar</button><button class="mk-btn" data-a="acancel">Cancelar</button></div></div>';
    else h += '<button class="mk-btn sm" data-a="aedit">Corregir montos</button>';
    return h;
  }

  var VIEWS = { inicio: vInicio, plan: vPlan, deudas: vDeudas, fijos: vGastos, ahorro: vAhorro };
  function render() {
    $('#sub').textContent = cap(P.monthName(S.month)) + ' ' + S.month.slice(0, 4);
    $('#tabs').innerHTML = TABS.map(function (t) { return '<button data-a="tab" data-t="' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '>' + ic(t[2], 22) + t[1] + '</button>'; }).join('');
    $('#view').innerHTML = VIEWS[tab]();
    var det = $('#bk'); if (det) det.addEventListener('toggle', function () { ui.det = det.open; });
  }
  // Se enfoca dentro del mismo toque: iOS solo abre el teclado si el foco se pide desde el gesto.
  function focusFirst() { var e = document.querySelector('#panel input, #view .card input[type=text]'); if (e) e.focus(); }

  // ---------- compartir y copias ----------
  function download(file) {
    var url = URL.createObjectURL(file), a = document.createElement('a');
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }
  function makeFile() {
    var now = new Date(); C = P.calc(S);
    return { now: now, file: new File(['﻿' + B.toCSV(S, C, now)], 'plan-de-deudas-' + B.dateName(now) + '.csv', { type: 'text/csv' }), text: B.summaryText(S, C, now) };
  }
  function markCopy(tipo) { S.lastBackup = Date.now(); commit('copia', { tipo: tipo }); render(); }
  // Sin await antes de navigator.share: iOS exige que se llame dentro del toque.
  function doShare(withText) {
    var m = makeFile(), data = { files: [m.file], title: 'Plan de deudas' };
    if (withText) data.text = m.text;
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [m.file] })) {
      navigator.share(data).then(function () { markCopy(withText ? 'compartir' : 'guardar'); toast(withText ? 'Resumen compartido' : 'Copia guardada'); }, function (e) {
        if (e && e.name === 'AbortError') return;
        fallbackDownload(m, withText);
      });
    } else fallbackDownload(m, withText);
  }
  function fallbackDownload(m, withText) {
    download(m.file);
    if (withText && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.text).catch(function () { /* nada */ });
    markCopy(withText ? 'compartir' : 'guardar');
    toast(withText ? 'Se guardó el archivo y se copió el mensaje. Pegalo y adjuntá el archivo en WhatsApp.' : 'Se guardó el archivo de la copia.');
  }
  function readImport(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try { ui.imp = { S: B.fromCSV(fr.result), name: file.name }; ui.impErr = null; }
      catch (e) { ui.imp = null; ui.impErr = e.message; }
      ui.det = true; render();
    };
    fr.onerror = function () { ui.imp = null; ui.impErr = 'No se pudo leer el archivo.'; ui.det = true; render(); };
    fr.readAsText(file);
  }

  // ---------- acciones ----------
  var A = {
    tab: function (b) { resetUi(); ui.sub = 'fijos'; tab = b.dataset.t; hideToast(); render(); window.scrollTo(0, 0); },
    pay: function () { if (!S.debts.some(function (d) { return d.b > 0; })) { toast('No hay deudas pendientes'); return; } if (tab !== 'inicio') { resetUi(); tab = 'inicio'; } ui.panel = 'pay'; render(); window.scrollTo(0, 0); focusFirst(); },
    save: function () { ui.panel = 'save'; render(); focusFirst(); },
    no: function () { ui.panel = null; render(); },
    ok: function () {
      var a = amt($('#f-amt').value);
      if (ui.panel === 'pay') {
        if (!a) return fail('Poné cuánto pagaste.');
        var d = find(S.debts, $('#f-debt').value); if (!d) return fail('Elegí una deuda.');
        var real = Math.min(a, d.b);
        d.b -= real; d.paid += real;
        commit('pago', { id: d.id, n: d.n, monto: real, pedido: a });
        undoInfo = { t: 'pago', id: d.id, amt: real };
        toast(real < a ? 'Deuda saldada: se anotaron ' + money(real) + ', que era lo que quedaba' : d.b === 0 ? 'Deuda saldada' : 'Pago anotado', true);
      } else {
        if (!a) return fail('Poné cuánto apartaste.');
        S.saved += a; S.savedMonth += a;
        commit('ahorro', { monto: a });
        undoInfo = { t: 'ahorro', amt: a };
        toast(syncGoal() ? '¡Llegaste a la meta! El ahorro pasa a deudas.' : 'Ahorro anotado', true);
      }
      ui.panel = null; render();
    },
    undo: function () {
      var u = undoInfo; undoInfo = null; if (!u) return;
      if (u.t === 'pago') { var d = find(S.debts, u.id); if (d) { d.b += u.amt; d.paid = Math.max(0, d.paid - u.amt); } commit('deshacer', { de: 'pago', n: d ? d.n : '', monto: u.amt }); }
      else { S.saved = Math.max(0, S.saved - u.amt); S.savedMonth = Math.max(0, S.savedMonth - u.amt); syncGoal(); commit('deshacer', { de: 'ahorro', monto: u.amt }); }
      render(); toast('Deshecho');
    },
    useprev: function () { S.income = S.prevIncome; commit('ingreso', { antes: 0, despues: S.income }); render(); },
    step: function (b) { var k = b.dataset.k; setPct(k, (k === 'dp' ? S.dp : S.sp) + parseInt(b.dataset.d, 10)); },
    sh: function (b) {
      var me = find(S.debts, b.dataset.i), d = parseInt(b.dataset.d, 10); if (!me) return;
      var others = S.debts.filter(function (x) { return P.isAct(x) && x !== me; }); if (!others.length) return;
      var before = sharesMap(), step = Math.abs(d), delta;
      if (d > 0) { var from = others.slice().sort(function (x, y) { return y.share - x.share; })[0]; delta = Math.min(step, from.share); if (delta <= 0) return; me.share += delta; from.share -= delta; }
      else { var to = others.slice().sort(function (x, y) { return x.share - y.share; })[0]; delta = Math.min(step, me.share); if (delta <= 0) return; me.share -= delta; to.share += delta; }
      coalesce('reparto', 'reparto', before, sharesMap()); refreshPlan();
    },
    suggest: function () {
      var before = sharesMap();
      if (!P.suggest(S)) { toast('Cargá lo que cobraste y tus deudas para sugerir un reparto'); return; }
      commit('reparto', { motivo: 'sugerido', antes: before, despues: sharesMap() }); toast('Reparto sugerido'); refreshPlan();
    },
    sub: function (b) { ui.sub = b.dataset.s; ui.fform = null; ui.fdel = null; ui.xform = null; ui.xdel = null; render(); },
    xgo: function () { resetUi(); tab = 'fijos'; ui.sub = 'extras'; ui.xform = { id: null }; hideToast(); render(); window.scrollTo(0, 0); focusFirst(); },
    xnew: function () { ui.xform = { id: null }; render(); focusFirst(); },
    xedit: function (b) { ui.xform = { id: b.dataset.i }; ui.xdel = null; render(); focusFirst(); },
    xcancel: function () { ui.xform = null; render(); },
    xsave: function () {
      var nm = $('#f-xname').value.trim().slice(0, 80), a = amt($('#f-xamt').value);
      if (!nm || !a) return fail('Poné qué fue y cuánto costó.');
      var ed = ui.xform.id ? find(S.extras, ui.xform.id) : null;
      if (ed) { var antes = { n: ed.n, a: ed.a }; ed.n = nm; ed.a = a; if (antes.n !== nm || antes.a !== a) commit('extra_edicion', { antes: antes, despues: { n: nm, a: a } }); }
      else { S.extras.push({ id: P.uid(), n: nm, a: a, ts: Date.now() }); commit('extra_alta', { n: nm, a: a }); }
      ui.xform = null; toast('Gasto extra anotado'); render();
    },
    xdel: function (b) { ui.xdel = b.dataset.i; render(); },
    xdelno: function () { ui.xdel = null; render(); },
    xdelyes: function (b) { var e = find(S.extras, b.dataset.i); if (e) { S.extras.splice(S.extras.indexOf(e), 1); commit('extra_baja', { n: e.n, a: e.a }); } ui.xdel = null; toast('Gasto borrado'); render(); },
    fnew: function () { ui.fform = { id: null }; render(); focusFirst(); },
    fedit: function (b) { ui.fform = { id: b.dataset.i }; ui.fdel = null; render(); focusFirst(); },
    fcancel: function () { ui.fform = null; render(); },
    chip: function (b) { var x = b.dataset.x; $(x ? '#f-xname' : '#f-fname').value = b.dataset.n; $(x ? '#f-xamt' : '#f-famt').focus(); },
    fsave: function () {
      var nm = $('#f-fname').value.trim().slice(0, 80), a = amt($('#f-famt').value);
      if (!nm || !a) return fail('Poné qué es y cuánto cuesta por mes.');
      var ed = ui.fform.id ? find(S.fixed, ui.fform.id) : null;
      if (ed) { var antes = { n: ed.n, a: ed.a }; ed.n = nm; ed.a = a; if (antes.n !== nm || antes.a !== a) commit('fijo_edicion', { antes: antes, despues: { n: nm, a: a } }); }
      else { S.fixed.push({ id: P.uid(), n: nm, a: a }); commit('fijo_alta', { n: nm, a: a }); }
      ui.fform = null; toast('Gasto guardado'); render();
    },
    fdel: function (b) { ui.fdel = b.dataset.i; render(); },
    fdelno: function () { ui.fdel = null; render(); },
    fdelyes: function (b) { var f = find(S.fixed, b.dataset.i); if (f) { S.fixed.splice(S.fixed.indexOf(f), 1); commit('fijo_baja', { n: f.n, a: f.a }); } ui.fdel = null; toast('Gasto borrado'); render(); },
    new: function () { ui.form = { id: null }; render(); focusFirst(); },
    edit: function (b) { ui.form = { id: b.dataset.i }; ui.del = null; render(); focusFirst(); },
    cancelform: function () { ui.form = null; render(); },
    saveform: function () {
      var nm = $('#f-name').value.trim().slice(0, 80), a = amt($('#f-amt').value), m = amt($('#f-min').value);
      var rt = $('#f-rtype').value, rv = parseFloat(String($('#f-rate').value).replace(',', '.')); rv = isFinite(rv) && rv > 0 ? Math.min(rv, 1000) : 0;
      var rate = rv > 0 ? P.toMonthly(rt, rv) : 0;
      var due = Math.max(0, Math.min(31, parseInt($('#f-due').value, 10) || 0));
      var lt = parseFloat(String($('#f-late').value).replace(',', '.')); lt = isFinite(lt) && lt > 0 ? Math.min(lt, 1000) : 0;
      var ed = ui.form.id ? find(S.debts, ui.form.id) : null;
      if (!nm) return fail('Poné el nombre.');
      if (!ed && !a) return fail('Poné cuánto debés.');
      if (ed) {
        var antes = dsnap(ed), paid = $('#f-paid') ? amt($('#f-paid').value) : ed.paid;
        ed.n = nm; ed.b = a; ed.paid = paid; ed.min = m || ed.min; ed.rate = rate; ed.rt = rt; ed.rv = rv; ed.due = due; ed.late = lt;
        var despues = dsnap(ed);
        if (JSON.stringify(antes) !== JSON.stringify(despues)) commit('deuda_edicion', { n: nm, antes: antes, despues: despues });
        else persist();
        toast('Deuda guardada');
      } else {
        var nd = { id: P.uid(), n: nm, b: a, min: m || Math.round(a * 0.1), rate: rate, rt: rt, rv: rv, due: due, late: lt, paid: 0, share: 0 };
        S.debts.push(nd);
        commit('deuda_alta', { n: nm, b: a, min: nd.min, rate: rate, due: due, late: lt });
        resplit('deuda nueva');
        toast('Deuda guardada. Repartí el pago de nuevo; podés ajustarlo en Plan.');
      }
      ui.form = null; render();
    },
    del: function (b) { ui.del = b.dataset.i; render(); },
    delno: function () { ui.del = null; render(); },
    delyes: function (b) {
      var d = find(S.debts, b.dataset.i);
      if (d) { S.debts.splice(S.debts.indexOf(d), 1); commit('deuda_baja', { n: d.n, b: d.b }); if (S.debts.some(P.isAct)) resplit('deuda borrada'); }
      ui.del = null; toast('Deuda borrada'); render();
    },
    aedit: function () { ui.aform = true; render(); focusFirst(); },
    acancel: function () { ui.aform = false; render(); },
    asave: function () {
      var antes = { colchon: S.saved, mes: S.savedMonth }, n1 = amt($('#f-saved').value), n2 = amt($('#f-sm').value);
      S.saved = n1; S.savedMonth = n2; syncGoal();
      if (antes.colchon !== n1 || antes.mes !== n2) commit('ahorro_ajuste', { antes: antes, despues: { colchon: n1, mes: n2 } }); else persist();
      ui.aform = false; toast('Ahorro corregido'); render();
    },
    hint: function () { lsSet('pdd:hint', '1'); render(); },
    flash: function () { S.flash = null; persist(); render(); },
    hideDemo: function () { S.demo = false; persist(); render(); },
    clearDemo: function () { var n = new Date(); S = P.blank(n); persist(); resetUi(); render(); toast('Listo. Empezá cargando lo que cobraste en Plan.'); },
    share: function () { doShare(true); },
    backup: function () { if (tab !== 'inicio') { resetUi(); tab = 'inicio'; render(); } doShare(false); },
    impno: function () { ui.imp = null; ui.impErr = null; render(); },
    impyes: function () {
      var next = ui.imp.S, name = ui.imp.name; P.logEv(next, 'importacion', { desde: name });
      S = next; var r = P.rollover(S, new Date()); persist(); resetUi(); render(); toast(r && r.interest > 0 ? 'Copia restaurada. Empezó un mes nuevo.' : 'Copia restaurada');
    },
    rst: function () { ui.rst = true; ui.det = true; render(); },
    rstno: function () { ui.rst = false; render(); },
    rstyes: function () { S = P.blank(new Date()); persist(); resetUi(); tab = 'inicio'; render(); window.scrollTo(0, 0); toast('Empezaste de cero'); }
  };

  function setPct(k, v) {
    var before = { dp: S.dp, sp: S.sp };
    v = Math.max(0, Math.round(v) || 0);
    if (k === 'dp') S.dp = Math.min(v, 100 - S.sp); else S.sp = Math.min(v, 100 - S.dp);
    coalesce('plan', 'plan', before, { dp: S.dp, sp: S.sp }); refreshPlan();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var f = A[b.dataset.a]; if (f) f(b);
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute('data-money')) { var dg = t.value.replace(/,\d{1,2}$/, '').replace(/\D/g, ''); t.value = dg ? P.fmtNum(parseInt(dg, 10)) : ''; }
    if (t.id === 'f-rate') rateOut();
    if (t.id === 'inc') { var before = S.income; S.income = amt(t.value); coalesce('ingreso', 'ingreso', before, S.income); refreshPlan(); }
    else { var er = $('#err'); if (er && t.closest('#view')) er.hidden = true; }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'f-rtype') rateOut();
    if (t.id === 'impfile') { if (t.files && t.files[0]) readImport(t.files[0]); t.value = ''; }
    if (t.dataset && t.dataset.pct) { var n = parseInt(t.value, 10); if (isFinite(n)) setPct(t.dataset.pct, n); else refreshPlan(); }
    if (t.id === 'goalin') {
      var g = amt(t.value);
      if (g) { var b0 = S.goal; S.goal = g; coalesce('meta', 'meta', b0, g); syncGoal(); render(); } else t.value = P.fmtNum(S.goal);
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (!S) return;
    if (document.visibilityState === 'hidden') { flushAll(); return; }
    var r = P.rollover(S, new Date());
    if (r) { persist(); render(); return; }
    if (!(ui.panel || ui.form || ui.fform || ui.xform || ui.aform || ui.imp || ui.rst)) render();
  });
  window.addEventListener('pagehide', function () { if (S) flushAll(); });

  // ---------- inicio ----------
  ST.onStatus(function (ok) { if (ok !== storeOk) { storeOk = ok; if (S && tab === 'inicio') render(); } });
  ST.load().then(function (loaded) {
    var now = new Date();
    S = loaded || P.demo(now);
    var r = P.rollover(S, now);
    if (r || !loaded) persist();
    render();
    document.addEventListener('click', function once() { document.removeEventListener('click', once); ST.persist(); });
  });
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* sin conexión: no pasa nada */ }); });
  PDD.getState = function () { return S; };
})();
