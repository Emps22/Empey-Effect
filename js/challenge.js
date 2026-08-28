// The Empey Effect — Weekly Challenge
// Loads content/challenge.json and wires up the "I did it!" counter.
// Uses Abacus (abacus.jasoncameron.dev), the same free counting service
// as the Kindness Counter and post likes. The counter key is generated
// from the challenge text itself, so publishing a new challenge each
// week automatically starts a fresh count — no manual reset needed.

(function () {
  const NAMESPACE = 'empeyeffect-waterloo-wi';

  function slugify(str) {
    return String(str || 'challenge').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'challenge';
  }

  async function init() {
    const textEl = document.getElementById('challenge-text');
    const whyEl = document.getElementById('challenge-why');
    const weekEl = document.getElementById('challenge-week');
    const btn = document.getElementById('challenge-btn');
    const countEl = document.getElementById('challenge-count-num');
    if (!textEl || !btn) return;

    let data;
    try {
      const res = await fetch('content/challenge.json', { cache: 'no-store' });
      data = await res.json();
    } catch (err) {
      textEl.textContent = "Check back soon for this week's challenge.";
      return;
    }

    textEl.textContent = data.challenge_text || '';
    if (data.week_label) weekEl.textContent = data.week_label;
    if (data.why) {
      whyEl.textContent = data.why;
      whyEl.style.display = 'block';
    }

    const key = 'challenge-' + slugify(data.challenge_text);
    const doneFlag = localStorage.getItem('done:' + key) === '1';
    if (doneFlag) {
      btn.classList.add('done');
      btn.textContent = '✓ You did it!';
    }

    fetch(`https://abacus.jasoncameron.dev/get/${NAMESPACE}/${key}`)
      .then(res => res.ok ? res.json() : { value: 0 })
      .then(d => { countEl.textContent = Number(d.value) || 0; })
      .catch(() => { countEl.textContent = '0'; });

    btn.addEventListener('click', () => {
      if (btn.classList.contains('done')) return;
      btn.disabled = true;
      fetch(`https://abacus.jasoncameron.dev/hit/${NAMESPACE}/${key}`)
        .then(res => res.json())
        .then(d => {
          countEl.textContent = Number(d.value) || '+1';
          btn.classList.add('done');
          btn.textContent = '✓ You did it!';
          localStorage.setItem('done:' + key, '1');
        })
        .catch(() => {})
        .finally(() => { btn.disabled = false; });
    });
  }

  init();
})();
