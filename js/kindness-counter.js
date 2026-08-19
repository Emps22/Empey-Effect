// The Empey Effect — Kindness Counter
// Uses Abacus (abacus.jasoncameron.dev), a free, no-signup counting service.
// Counts once per visit (browser session) rather than once per page load,
// so clicking between pages or refreshing doesn't inflate the number.

(function () {
  var NAMESPACE = 'empeyeffect-waterloo-wi';
  var KEY = 'kindness-counter';
  var SESSION_FLAG = 'empeyeffect-counted-session';
  var el = document.getElementById('kindness-count');
  if (!el) return;

  var alreadyCounted = sessionStorage.getItem(SESSION_FLAG) === '1';
  var action = alreadyCounted ? 'get' : 'hit';
  var endpoint = 'https://abacus.jasoncameron.dev/' + action + '/' + NAMESPACE + '/' + KEY;

  fetch(endpoint)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var n = Number(data.value);
      el.textContent = isNaN(n) ? '—' : n.toLocaleString();
      if (!alreadyCounted) sessionStorage.setItem(SESSION_FLAG, '1');
    })
    .catch(function () {
      el.textContent = '—';
    });
})();
