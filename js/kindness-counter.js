// The Empey Effect — Kindness Counter
// Uses countapi.mileshilliard.com, a free, no-signup counting service.
// Counts once per visit (browser session) rather than once per page load,
// so clicking between pages or refreshing doesn't inflate the number.

(function () {
  var COUNTER_KEY = 'empeyeffect-waterloo-wi-kindness-counter-v1';
  var SESSION_FLAG = 'empeyeffect-counted-session';
  var el = document.getElementById('kindness-count');
  if (!el) return;

  var alreadyCounted = sessionStorage.getItem(SESSION_FLAG) === '1';
  var endpoint = 'https://countapi.mileshilliard.com/api/v1/' +
    (alreadyCounted ? 'get/' : 'hit/') + COUNTER_KEY;

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
