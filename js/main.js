// The Empey Effect — renders community feed + photo wall from
// the JSON files the admin (Decap CMS) writes to /content/.

const TILTS = ['-1.4deg', '0.8deg', '-0.6deg', '1.2deg', '-1deg', '0.5deg'];
function tiltFor(i){ return TILTS[i % TILTS.length]; }

function fmtDate(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
}

const TAG_LABEL = { Quote: 'Quote', News: 'Good News', Volunteer: 'Volunteer opportunity', Video: 'Video' };
const ABACUS_NAMESPACE = 'empeyeffect-waterloo-wi';

// Turns a YouTube / Facebook / Vimeo link into an embeddable player URL.
// Returns null if the link isn't a recognized video URL.
function videoEmbedSrc(url){
  if(!url) return null;
  try{
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    if(host === 'youtu.be'){
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if(host === 'youtube.com' || host === 'm.youtube.com'){
      const id = u.searchParams.get('v');
      if(id) return `https://www.youtube.com/embed/${id}`;
      if(u.pathname.startsWith('/shorts/')) return `https://www.youtube.com/embed/${u.pathname.split('/')[2]}`;
      return null;
    }
    if(host === 'vimeo.com'){
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    if(host === 'facebook.com' || host === 'fb.watch'){
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
    }
  }catch(err){ /* not a valid URL */ }
  return null;
}

// Turns a post's title + date into a stable, unique key for the like
// counter — no extra field needed in the admin panel.
function slugify(str){
  return String(str || 'post').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'post';
}
function likeKeyFor(post){
  const stamp = post.date ? new Date(post.date).getTime() : 0;
  return 'like-' + slugify(post.title).slice(0, 40) + '-' + stamp;
}

let allPosts = [];
let activeFilter = 'All';

async function loadFeed(){
  const grid = document.getElementById('feed-grid');
  if(!grid) return;
  try{
    const res = await fetch('content/feed.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('no feed yet');
    const data = await res.json();
    allPosts = (data.posts || []).slice().sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));
    renderFeed();
  }catch(err){
    grid.innerHTML = '<p class="feed-empty">Nothing pinned yet — check back soon.</p>';
  }
}

function renderFeed(){
  const grid = document.getElementById('feed-grid');
  const posts = activeFilter === 'All' ? allPosts : allPosts.filter(p => p.type === activeFilter);
  if(!posts.length){
    grid.innerHTML = '<p class="feed-empty">Nothing here yet — check back soon.</p>';
    return;
  }
  grid.innerHTML = posts.map((p, i) => {
    const key = likeKeyFor(p);
    const embedSrc = p.type === 'Video' ? videoEmbedSrc(p.link) : null;
    const isVideo = p.type === 'Video';
    return `
    <article class="note${isVideo ? ' video-note' : ''}" style="--tilt:${isVideo ? '0deg' : tiltFor(i)}">
      <span class="tag">${TAG_LABEL[p.type] || p.type || 'Post'}</span>
      <h4>${escapeHtml(p.title || '')}</h4>
      ${embedSrc
        ? `<div class="video-embed"><iframe src="${escapeAttr(embedSrc)}" title="${escapeAttr(p.title || 'Video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
        : ''}
      <p>${escapeHtml(p.body || '')}</p>
      ${p.link && !embedSrc ? `<a class="note-link" href="${escapeAttr(p.link)}" target="_blank" rel="noopener">${isVideo ? 'Watch video →' : 'Learn more →'}</a>` : ''}
      ${p.link && embedSrc ? `<a class="note-link" href="${escapeAttr(p.link)}" target="_blank" rel="noopener">Open on original site →</a>` : ''}
      <div class="note-footer">
        <span class="date">${fmtDate(p.date)}</span>
        <button class="like-btn" data-key="${escapeAttr(key)}" aria-label="Like this post">
          <span aria-hidden="true">👍</span> <span class="like-count">…</span>
        </button>
      </div>
    </article>
  `;
  }).join('');
  initLikeButtons();
}

function initLikeButtons(){
  document.querySelectorAll('.like-btn').forEach(btn => {
    const key = btn.dataset.key;
    const countEl = btn.querySelector('.like-count');
    const alreadyLiked = localStorage.getItem('liked:' + key) === '1';
    if(alreadyLiked) btn.classList.add('liked');

    fetch(`https://abacus.jasoncameron.dev/get/${ABACUS_NAMESPACE}/${key}`)
      .then(res => res.ok ? res.json() : { value: 0 })
      .then(data => { countEl.textContent = Number(data.value) || 0; })
      .catch(() => { countEl.textContent = '0'; });
  });
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.like-btn');
  if(!btn || btn.classList.contains('liked')) return;
  const key = btn.dataset.key;
  const countEl = btn.querySelector('.like-count');
  btn.disabled = true;
  fetch(`https://abacus.jasoncameron.dev/hit/${ABACUS_NAMESPACE}/${key}`)
    .then(res => res.json())
    .then(data => {
      countEl.textContent = Number(data.value) || '+1';
      btn.classList.add('liked');
      localStorage.setItem('liked:' + key, '1');
    })
    .catch(() => {})
    .finally(() => { btn.disabled = false; });
});

async function loadPhotos(){
  const wall = document.getElementById('photo-wall');
  if(!wall) return;
  try{
    const res = await fetch('content/photos.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('no photos yet');
    const data = await res.json();
    const photos = (data.photos || []).slice().reverse();
    if(!photos.length){
      wall.innerHTML = '<p class="photo-empty">No photos posted yet.</p>';
      return;
    }
    wall.innerHTML = photos.map((p, i) => `
      <figure class="photo-frame" style="--tilt:${tiltFor(i+1)}">
        <img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.caption || 'Empey Effect community photo')}" loading="lazy">
        ${p.caption ? `<figcaption>${escapeHtml(p.caption)}</figcaption>` : ''}
      </figure>
    `).join('');
  }catch(err){
    wall.innerHTML = '<p class="photo-empty">No photos posted yet.</p>';
  }
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function escapeAttr(str){ return escapeHtml(str); }

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if(!btn) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.filter;
  renderFeed();
});

loadFeed();
loadPhotos();
