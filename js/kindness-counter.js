// The Empey Effect — Kindness Counter
// Uses countapi.mileshilliard.com, a free, no-signup counting service.
// Each page load "hits" (increments) a shared counter and displays the total.

(function () {
  var COUNTER_KEY = 'empeyeffect-waterloo-wi-kindness-counter-v1';
  var el = document.getElementById('kindness-count');
  if (!el) return;

  fetch('https://countapi.mileshilliard.com/api/v1/hit/' + COUNTER_KEY)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var n = Number(data.value);
      el.textContent = isNaN(n) ? '—' : n.toLocaleString();
    })
    .catch(function () {
      el.textContent = '—';
    });
})();
