// The Empey Effect — Weekly Challenge (with past-challenges archive)
// Reads content/challenges.json (a growing list, newest first by date).
// The most recent entry becomes "this week's challenge"; everything else
// renders in a collapsible archive list below it.
//
// Uses Abacus (abacus.jasoncameron.dev), the same free counting service
// as the Kindness Counter and post likes. Each challenge's counter key is
// generated from its own text (trimmed to fit Abacus's 64-character key
// limit), so a new challenge automatically starts a fresh count.

(function () {
  const NAMESPACE = 'empeyeffect-waterloo-wi';

  function slugify(str) {
    return String(str || 'challenge').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'challenge';
  }
  // "challenge-" (10 chars) + up to 40 chars of slug = 50 chars max,
  // safely under Abacus's 64-character key limit.
  function keyFor(text) { return 'challenge-' + slugify(text).slice(0, 40); }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  async function init() {
    const textEl = document.getElementById('challenge-text');
    const whyEl = document.getElementById('challenge-why');
    const weekEl = document.getElementById('challenge-week');
    const btn = document.getElementById('challenge-btn');
    const countEl = document.getElementById('challenge-count-num');
    const archiveToggle = document.getElementById('challenge-archive-toggle');
    const archiveList = document.getElementById('challenge-archive-list');
    if (!textEl || !btn) return;

    let data;
    try {
      const res = await fetch('content/challenges.json', { cache: 'no-store' });
      data = await res.json();
    } catch (err) {
      textEl.textContent = "Check back soon for this week's challenge.";
      return;
    }

    const challenges = (data.challenges || [])
      .slice()
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    if (!challenges.length) {
      textEl.textContent = "Check back soon for this week's challenge.";
      return;
    }

    const current = challenges[0];
    const past = challenges.slice(1);

    textEl.textContent = current.challenge_text || '';
    if (current.week_label) weekEl.textContent = current.week_label;
    if (current.why) {
      whyEl.textContent = current.why;
      whyEl.style.display = 'block';
    }

    const key = keyFor(current.challenge_text);
    const doneFlag = localStorage.getItem('done:' + key) === '1';
    if (doneFlag) {
      btn.classList.add('done');
      btn.textContent = '✓ You did it!';
    }

    fetch(`https://abacus.jasoncameron.dev/get/${NAMESPACE}/${key}`)
      .then(res => res.json())
      .then(d => {
        countEl.textContent = (d && !d.error && typeof d.value === 'number') ? d.value : 0;
      })
      .catch(() => { countEl.textContent = '0'; });

    btn.addEventListener('click', () => {
      if (btn.classList.contains('done')) return;
      btn.disabled = true;
      fetch(`https://abacus.jasoncameron.dev/hit/${NAMESPACE}/${key}`)
        .then(res => res.json())
        .then(d => {
          if (!d || d.error || typeof d.value !== 'number') {
            throw new Error((d && d.error) || 'Unexpected response');
          }
          countEl.textContent = d.value;
          btn.classList.add('done');
          btn.textContent = '✓ You did it!';
          localStorage.setItem('done:' + key, '1');
        })
        .catch(() => {
          // Real failure — leave the button clickable so they can try again.
        })
        .finally(() => { btn.disabled = false; });
    });

    // ---- Past challenges archive ----
    if (archiveToggle && archiveList && past.length) {
      archiveList.innerHTML = past.map(c => `
        <li class="challenge-archive-item">
          <span class="challenge-archive-week">${escapeHtml(c.week_label || fmtDate(c.date))}</span>
          <span class="challenge-archive-text">${escapeHtml(c.challenge_text || '')}</span>
        </li>
      `).join('');

      archiveToggle.style.display = 'inline-block';
      archiveToggle.textContent = `See ${past.length} past challenge${past.length > 1 ? 's' : ''} ▾`;
      archiveToggle.addEventListener('click', () => {
        const open = archiveList.classList.toggle('open');
        archiveToggle.textContent = open
          ? 'Hide past challenges ▲'
          : `See ${past.length} past challenge${past.length > 1 ? 's' : ''} ▾`;
      });
    } else if (archiveToggle) {
      archiveToggle.style.display = 'none';
    }
  }

  init();
})();
