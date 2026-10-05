/* Guardado local: IndexedDB como principal y localStorage como espejo síncrono
   (iOS puede cortar escrituras asíncronas al cerrar la app). Todo queda en el dispositivo. */
(function (root) {
  'use strict';
  var P = root.PDD.calc;
  var DB = 'plan-de-deudas', STORE = 'kv', KEY = 'state', LS = 'pdd:state';
  var chain = Promise.resolve(), listener = null;

  function openDB() {
    return new Promise(function (res, rej) {
      if (!root.indexedDB) return rej(new Error('sin indexedDB'));
      var r;
      try { r = root.indexedDB.open(DB, 1); } catch (e) { return rej(e); }
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('bloqueada')); };
    });
  }
  function idbGet() {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        q.onsuccess = function () { db.close(); res(q.result || null); };
        q.onerror = function () { db.close(); rej(q.error); };
      });
    });
  }
  function idbPut(json) {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(json, KEY);
        tx.oncomplete = function () { db.close(); res(); };
        tx.onerror = tx.onabort = function () { db.close(); rej(tx.error); };
      });
    });
  }
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error('timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function parse(raw, keepCorrupt) {
    if (!raw) return null;
    try { var S = P.sanitize(JSON.parse(raw)); if (S) return S; } catch (e) { /* corrupto */ }
    if (keepCorrupt) { try { root.localStorage.setItem('pdd:corrupt', raw); } catch (e) { /* sin espacio */ } }
    return null;
  }

  function load() {
    var ls = null;
    try { ls = root.localStorage.getItem(LS); } catch (e) { /* bloqueado */ }
    return withTimeout(idbGet(), 3000).catch(function () { return null; }).then(function (raw) {
      var a = parse(raw, true), b = parse(ls, true);
      if (a && b) return a.updatedAt >= b.updatedAt ? a : b;
      return a || b || null;
    });
  }

  function save(S) {
    // Siempre más nuevo que el guardado anterior, aunque dos guardados caigan en el mismo milisegundo.
    S.updatedAt = Math.max(Date.now(), (S.updatedAt || 0) + 1);
    var json = JSON.stringify(S), lsOk = true;
    try { root.localStorage.setItem(LS, json); } catch (e) { lsOk = false; }
    chain = chain.then(function () { return withTimeout(idbPut(json), 5000); }).then(function () { return true; }, function () { return false; })
      .then(function (idbOk) { if (listener) listener(lsOk || idbOk); return lsOk || idbOk; });
    return chain;
  }

  function persist() {
    try { if (root.navigator.storage && root.navigator.storage.persist) return root.navigator.storage.persist(); } catch (e) { /* nada */ }
    return Promise.resolve(false);
  }

  root.PDD.store = { load: load, save: save, persist: persist, onStatus: function (f) { listener = f; } };
})(window);
