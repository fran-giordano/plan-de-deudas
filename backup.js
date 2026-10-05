/* Exportar / importar copia (CSV) y texto del resumen. El CSV lleva el historial legible
   y, en la última fila, una copia completa del estado para poder restaurarla. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./calc.js'));
  else { root.PDD = root.PDD || {}; root.PDD.backup = factory(root.PDD.calc); }
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';
  var fmt = P.fmt;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function stamp(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dateName(now) { return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()); }

  function q(v) { v = String(v == null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  // Evita que Excel/Sheets interpreten como fórmula un texto que empieza con = + - @
  function safe(s) { s = String(s); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; }
  function row(a) { return a.map(q).join(','); }

  var LABELS = { n: 'nombre', b: 'saldo', min: 'mínimo', rate: 'interés mensual %', due: 'vence el día', late: 'recargo %', paid: 'pagado en el mes', a: 'monto' };
  var MONEY = { b: 1, min: 1, paid: 1, a: 1 };

  function diff(antes, despues) {
    var out = [];
    Object.keys(despues || {}).forEach(function (k) {
      if (!antes || antes[k] === despues[k]) return;
      var f = function (v) { return MONEY[k] && typeof v === 'number' ? fmt(v) : v; };
      out.push((LABELS[k] || k) + ': ' + f(antes[k]) + ' → ' + f(despues[k]));
    });
    return out.join('; ');
  }
  function mapDiff(antes, despues) {
    var keys = {}; Object.keys(antes || {}).concat(Object.keys(despues || {})).forEach(function (k) { keys[k] = 1; });
    return Object.keys(keys).map(function (k) { return k + ': ' + (antes && antes[k] != null ? antes[k] : 0) + '% → ' + (despues && despues[k] != null ? despues[k] : 0) + '%'; }).join('; ');
  }

  // Convierte un movimiento del historial en [tipo, detalle, monto]
  function describe(ev) {
    var d = ev.d || {}, t = ev.t;
    switch (t) {
      case 'ingreso': return ['Cobro', 'Cobro del mes: ' + fmt(d.antes || 0) + ' → ' + fmt(d.despues || 0), d.despues || 0];
      case 'pago': return ['Pago', 'Pago a "' + (d.n || '') + '"' + (d.pedido && d.pedido !== d.monto ? ' (se anotó solo lo que quedaba)' : ''), d.monto || 0];
      case 'ahorro': return ['Ahorro', 'Apartado para el colchón', d.monto || 0];
      case 'ahorro_ajuste': return ['Ahorro', 'Corrección: ' + diff(d.antes, d.despues), ''];
      case 'meta': return ['Meta', 'Meta del colchón: ' + fmt(d.antes || 0) + ' → ' + fmt(d.despues || 0), d.despues || 0];
      case 'meta_alcanzada': return ['Meta', 'El colchón llegó a la meta; el ahorro pasa a deudas', d.colchon || 0];
      case 'plan': return ['Plan', 'Porcentajes: deudas ' + (d.antes ? d.antes.dp : '?') + '% → ' + (d.despues ? d.despues.dp : '?') + '%; ahorro ' + (d.antes ? d.antes.sp : '?') + '% → ' + (d.despues ? d.despues.sp : '?') + '%', ''];
      case 'reparto': return ['Plan', 'Reparto entre deudas' + (d.motivo ? ' (' + d.motivo + ')' : '') + ': ' + mapDiff(d.antes, d.despues), ''];
      case 'deuda_alta': return ['Deuda nueva', '"' + (d.n || '') + '": saldo ' + fmt(d.b || 0) + ', mínimo ' + fmt(d.min || 0) + (d.rate ? ', interés ' + d.rate + '% mensual' : ''), d.b || 0];
      case 'deuda_edicion': return ['Deuda editada', '"' + (d.n || '') + '": ' + diff(d.antes, d.despues), ''];
      case 'deuda_baja': return ['Deuda borrada', '"' + (d.n || '') + '" (saldo ' + fmt(d.b || 0) + ')', d.b || 0];
      case 'fijo_alta': return ['Gasto fijo nuevo', '"' + (d.n || '') + '"', d.a || 0];
      case 'fijo_edicion': return ['Gasto fijo editado', diff(d.antes, d.despues), ''];
      case 'fijo_baja': return ['Gasto fijo borrado', '"' + (d.n || '') + '"', d.a || 0];
      case 'extra_alta': return ['Gasto extra', '"' + (d.n || '') + '"', d.a || 0];
      case 'extra_edicion': return ['Gasto extra editado', diff(d.antes, d.despues), ''];
      case 'extra_baja': return ['Gasto extra borrado', '"' + (d.n || '') + '"', d.a || 0];
      case 'mes_nuevo': {
        var its = (d.intereses || []).map(function (i) { return i.n + ' +' + fmt(i.m); }).join('; ');
        return ['Mes nuevo', 'Empezó ' + (d.mes || '') + (its ? '. Intereses estimados: ' + its : ''), ''];
      }
      case 'copia': return ['Copia', d.tipo === 'compartir' ? 'Resumen compartido' : 'Copia guardada', ''];
      case 'importacion': return ['Copia', 'Se restauró una copia' + (d.desde ? ' (' + d.desde + ')' : ''), ''];
      case 'deshacer': return ['Deshacer', 'Se deshizo un ' + (d.de || 'movimiento') + (d.n ? ' a "' + d.n + '"' : ''), d.monto || ''];
      default: return [t, JSON.stringify(d), ''];
    }
  }

  function toCSV(S, C, now) {
    var rows = [row(['fecha', 'tipo', 'detalle', 'monto'])], at = stamp(now.getTime());
    var tot = P.sum(S.debts, function (d) { return d.b; });
    rows.push(row([at, 'Resumen', 'Mes', P.monthName(S.month) + ' ' + S.month.slice(0, 4)]));
    rows.push(row([at, 'Resumen', 'Deuda total', tot]));
    S.debts.forEach(function (d) {
      rows.push(row([at, 'Resumen', safe('Deuda: ' + d.n + ' (mínimo ' + fmt(d.min) + (d.rate ? ', interés ' + d.rate + '% mensual' : '') + (d.due ? ', vence el día ' + d.due : '') + ')'), d.b]));
    });
    rows.push(row([at, 'Resumen', 'Cobrado este mes', S.income]));
    rows.push(row([at, 'Resumen', 'Pagado a deudas este mes', C.Pd]));
    rows.push(row([at, 'Resumen', 'Gastos fijos por mes', C.fixedTotal]));
    rows.push(row([at, 'Resumen', 'Gastos extras del mes', C.extraTotal]));
    rows.push(row([at, 'Resumen', 'Colchón (meta ' + fmt(S.goal) + ')', S.saved]));
    S.log.forEach(function (ev) {
      var x = describe(ev);
      rows.push(row([stamp(ev.ts), x[0], safe(x[1]), x[2]]));
    });
    rows.push(row([at, 'copia', JSON.stringify(S), '']));
    return rows.join('\r\n') + '\r\n';
  }

  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    var rows = [], r = [], f = '', inq = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inq) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else inq = false; } else f += c; }
      else if (c === '"') inq = true;
      else if (c === ',') { r.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; r.push(f); f = ''; rows.push(r); r = []; }
      else f += c;
    }
    if (f !== '' || r.length) { r.push(f); rows.push(r); }
    return rows;
  }

  function fromCSV(text) {
    var rows = parseCSV(text), hit = null;
    for (var i = rows.length - 1; i >= 0; i--) if (rows[i][1] === 'copia' && rows[i][2]) { hit = rows[i]; break; }
    if (!hit) throw new Error('Este archivo no parece una copia de la app.');
    var raw;
    try { raw = JSON.parse(hit[2]); } catch (e) { throw new Error('La copia está dañada o incompleta.'); }
    var S = P.sanitize(raw);
    if (!S) throw new Error('La copia está dañada o incompleta.');
    return S;
  }

  function summaryText(S, C, now) {
    var tot = P.sum(S.debts, function (d) { return d.b; });
    var prev = S.hist.length ? S.hist[S.hist.length - 1].total : null;
    var lines = ['Resumen de ' + P.monthName(S.month)];
    var l = 'Deuda total: ' + fmt(tot);
    if (prev !== null && tot !== prev) l += tot < prev ? ' (bajó ' + fmt(prev - tot) + ' desde el cierre del mes pasado)' : ' (subió ' + fmt(tot - prev) + ' desde el cierre del mes pasado)';
    lines.push(l);
    if (C.T > 0) lines.push('Pagado este mes: ' + fmt(C.Pd) + ' de ' + fmt(C.T));
    if (S.goal > 0 || S.saved > 0) lines.push('Colchón: ' + fmt(S.saved) + (S.goal > 0 ? ' de ' + fmt(S.goal) : ''));
    lines.push('Te mando el historial completo en el archivo.');
    return lines.join('\n');
  }

  return { toCSV: toCSV, fromCSV: fromCSV, parseCSV: parseCSV, summaryText: summaryText, describe: describe, dateName: dateName, stamp: stamp };
});
