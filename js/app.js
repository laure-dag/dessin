import { db, uid, exportAll, importAll } from './db.js';
import { render as md, parseProgramme, parseFiches, escapeHtml as esc, inline } from './markdown.js';
import { preparePhoto, blobUrl, takeUrls } from './images.js';

const view = document.getElementById('view');
const tabs = document.querySelectorAll('.tabbar a');

let programme;
let fiches;

const RAPPELS = [
  "Avant de colorier, dessine une petite flèche ☀️ : les ombres vont du côté opposé.",
  "Jamais de noir pour ombrer : même couleur, un cran plus foncée et un peu plus froide.",
  "Une seule ombre au bord net, c'est déjà tout le style « dessin animé ».",
  "Laisse le papier blanc pour le petit reflet brillant.",
  "3 ou 4 couleurs douces + une seule touche vive = une palette cozy.",
  "Lumière chaude (lampe, bougie) = ombres froides (mauve, bleu-gris).",
  "Un petit ovale d'ombre sous un objet suffit pour qu'il ne flotte plus.",
  "Laisse sécher l'encre du contour avant de colorier au feutre à eau.",
  "Feutre à eau : repasser la même couleur une fois sec donne un ton plus foncé.",
  "Un trait un peu tremblé, c'est du charme, pas une erreur. 🌿",
  "Les yeux plus bas sur la tête = un personnage plus jeune et plus mignon.",
  "Les cheveux : une grande forme d'abord, les mèches à la fin.",
];

const GAMMES = ['Feutres à eau', 'Aquarelle', 'Feutres à alcool', 'Autre'];

// --- Utilitaires -------------------------------------------------------------

const fmtDate = (iso, opts = { day: 'numeric', month: 'long' }) =>
  new Date(iso).toLocaleDateString('fr-FR', opts);

function localDay(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

function pickFile(accept = 'image/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

async function state() {
  const [progress, entries] = await Promise.all([db.all('progress'), db.all('entries')]);
  const done = new Map(progress.filter((p) => p.done).map((p) => [p.day, p]));
  const current = programme.days.find((d) => !done.has(d.n)) || null;
  return { progress, entries, done, current };
}

function streak(entries, progress) {
  const days = new Set([
    ...entries.map((e) => localDay(e.date)),
    ...progress.filter((p) => p.doneAt).map((p) => localDay(p.doneAt)),
  ]);
  const d = new Date();
  if (!days.has(localDay(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(localDay(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function objectif(day) {
  const m = day.body.match(/\*\*Objectif :\*\*\s*(.*)/);
  if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1);
  const first = day.body.split('\n').find((l) => l.trim() && !l.startsWith('**'));
  return first ? first.replace(/^[-\d.]+\s*/, '') : '';
}

async function addEntry({ day = null, file }) {
  const { photo, thumb } = await preparePhoto(file);
  const entry = { id: uid(), day, date: new Date().toISOString(), photo, thumb, note: '' };
  await db.put('entries', entry);
  if (day) await markDone(day, true);
  return entry;
}

async function markDone(day, done) {
  const prev = (await db.get('progress', day)) || { day, note: '' };
  await db.put('progress', { ...prev, done, doneAt: done ? prev.doneAt || new Date().toISOString() : null });
}

function weekLabel(day) {
  const w = programme.weeks[day.week - 1];
  return w ? w.title.split('—')[0].trim() : '';
}

// --- Vues --------------------------------------------------------------------

async function viewToday() {
  const { entries, progress, done, current } = await state();
  const count = done.size;
  const total = programme.days.length;
  const s = streak(entries, progress);
  const last = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  const rappel = RAPPELS[Math.floor(Date.now() / 86400000) % RAPPELS.length];
  const lastExport = await db.getMeta('lastExport');
  const needBackup = entries.length > 0 && (!lastExport || Date.now() - new Date(lastExport) > 14 * 86400000);

  return `
  <header class="page-head">
    <div>
      <p class="kicker">${fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1>Mon carnet de dessin</h1>
    </div>
    <a class="icon-btn" href="#/reglages" aria-label="Réglages">⚙︎</a>
  </header>

  <section class="card stats">
    <div class="stat"><span class="big">${count}</span><span>/ ${total} jours</span></div>
    <div class="stat"><span class="big">${s}</span><span>jour${s > 1 ? 's' : ''} d'affilée</span></div>
    <div class="stat"><span class="big">${entries.length}</span><span>dessin${entries.length > 1 ? 's' : ''}</span></div>
    <div class="progress"><div style="width:${(count / total) * 100}%"></div></div>
  </section>

  ${current ? `
  <section class="card today">
    <p class="kicker">Jour ${current.n} · ${esc(weekLabel(current))}</p>
    <h2>${esc(current.title)}</h2>
    <p>${inline(objectif(current))}</p>
    <a class="btn" href="#/jour/${current.n}">Ouvrir la leçon du jour</a>
  </section>` : `
  <section class="card today">
    <h2>Parcours terminé ! 🎉</h2>
    <p>Bravo, 30 jours de dessin. Va voir ton avant/après.</p>
    <a class="btn" href="#/comparer">Comparer jour 1 et jour 30</a>
  </section>`}

  ${needBackup ? `
  <section class="card notice">
    <p>💾 Pense à faire une sauvegarde de tes dessins (dernière : ${lastExport ? fmtDate(lastExport) : 'jamais'}).</p>
    <a class="btn small" href="#/reglages">Sauvegarder</a>
  </section>` : ''}

  <section class="card rappel">
    <p class="kicker">Petit rappel</p>
    <p>${esc(rappel)}</p>
  </section>

  ${last ? `
  <section class="card">
    <p class="kicker">Mon dernier dessin</p>
    <a href="#/photo/${last.id}"><img class="last-photo" src="${blobUrl(last.thumb)}" alt="Dernier dessin"></a>
  </section>` : ''}
  `;
}

async function viewParcours() {
  const { done, current, entries } = await state();
  const thumbs = new Map();
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) if (e.day) thumbs.set(e.day, e);

  return `
  <header class="page-head"><h1>${esc(programme.title.split('·')[0].trim())}</h1></header>
  <details class="card about">
    <summary>Comment marche le parcours</summary>
    <div class="prose">${md(programme.intro)}</div>
  </details>
  ${programme.weeks.map((w) => `
    <section class="week">
      <h2>${esc(w.title)}</h2>
      ${w.intro ? `<div class="prose week-intro">${md(w.intro)}</div>` : ''}
      <ol class="days">
        ${w.days.map((d) => {
          const t = thumbs.get(d.n);
          const cls = done.has(d.n) ? 'done' : current && current.n === d.n ? 'current' : '';
          return `<li class="${cls} ${d.free ? 'free' : ''}">
            <a href="#/jour/${d.n}">
              <span class="num">${done.has(d.n) ? '✓' : d.n}</span>
              <span class="t">${esc(d.title)}</span>
              ${t ? `<img src="${blobUrl(t.thumb)}" alt="">` : ''}
            </a>
          </li>`;
        }).join('')}
      </ol>
    </section>`).join('')}
  `;
}

async function viewDay(n) {
  const day = programme.days.find((d) => d.n === n);
  if (!day) return `<p>Jour introuvable.</p>`;
  const [prog, entries, flags] = await Promise.all([db.get('progress', n), db.byDay(n), db.all('flags')]);
  const isDone = prog && prog.done;
  const prev = programme.days.find((d) => d.n === n - 1);
  const next = programme.days.find((d) => d.n === n + 1);

  setTimeout(() => {
    for (const f of flags) {
      const b = view.querySelector(`[data-flag="${CSS.escape(f.url)}"]`);
      if (b) { b.textContent = 'Signalé ✓'; b.classList.add('flagged'); }
    }
  });

  return `
  <nav class="crumbs"><a href="#/parcours">← Parcours</a></nav>
  <header class="lesson-head">
    <p class="kicker">Jour ${n} · ${esc(weekLabel(day))}</p>
    <h1>${esc(day.title)}</h1>
  </header>
  <article class="card prose lesson">${md(day.body)}</article>

  <section class="card mine">
    <h2>Mon dessin du jour</h2>
    ${entries.length ? `<div class="grid">${entries.map((e) => `
      <a href="#/photo/${e.id}"><img src="${blobUrl(e.thumb)}" alt="Dessin du jour ${n}"></a>`).join('')}</div>` : ''}
    <button class="btn" data-action="add-photo" data-day="${n}">📷 ${entries.length ? 'Ajouter une autre photo' : 'Ajouter la photo de mon dessin'}</button>
    <button class="btn ghost" data-action="toggle-done" data-day="${n}">
      ${isDone ? `✓ Fait le ${fmtDate(prog.doneAt)} (annuler)` : 'Marquer comme fait sans photo'}
    </button>
    <label class="field">
      <span>Mes notes (ce qui était facile, difficile…)</span>
      <textarea data-note-day="${n}" rows="3" placeholder="Ex. : les ombres de la tasse, c'était plus simple que prévu !">${esc((prog && prog.note) || '')}</textarea>
    </label>
  </section>

  <nav class="pager">
    ${prev ? `<a class="btn ghost small" href="#/jour/${prev.n}">← Jour ${prev.n}</a>` : '<span></span>'}
    ${next ? `<a class="btn ghost small" href="#/jour/${next.n}">Jour ${next.n} →</a>` : '<span></span>'}
  </nav>`;
}

async function viewGalerie() {
  const entries = (await db.all('entries')).sort((a, b) => b.date.localeCompare(a.date));
  return `
  <header class="page-head"><h1>Ma galerie</h1></header>
  <div class="actions-row">
    <button class="btn small" data-action="add-free">＋ Dessin libre</button>
    ${entries.length > 1 ? '<a class="btn small ghost" href="#/comparer">Avant / après</a>' : ''}
  </div>
  ${entries.length ? `<div class="gallery">${entries.map((e) => `
    <a href="#/photo/${e.id}" class="tile">
      <img src="${blobUrl(e.thumb)}" alt="">
      <span>${e.day ? `Jour ${e.day}` : 'Libre'} · ${fmtDate(e.date, { day: 'numeric', month: 'short' })}</span>
    </a>`).join('')}</div>` : `
  <div class="card empty"><p>Pas encore de dessin ici. Ouvre la leçon du jour et prends ton dessin en photo !</p></div>`}`;
}

async function viewPhoto(id) {
  const e = await db.get('entries', id);
  if (!e) return `<p>Photo introuvable.</p><a href="#/galerie">← Galerie</a>`;
  const day = e.day && programme.days.find((d) => d.n === e.day);
  return `
  <nav class="crumbs"><a href="javascript:history.back()">← Retour</a></nav>
  <figure class="photo-full"><img src="${blobUrl(e.photo)}" alt=""></figure>
  <section class="card">
    <p class="kicker">${fmtDate(e.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <h2>${day ? `<a href="#/jour/${day.n}">Jour ${day.n} — ${esc(day.title)}</a>` : 'Dessin libre'}</h2>
    <label class="field">
      <span>Note</span>
      <textarea data-note-entry="${e.id}" rows="3">${esc(e.note || '')}</textarea>
    </label>
    <button class="btn danger small" data-action="delete-entry" data-id="${e.id}">Supprimer cette photo</button>
  </section>`;
}

async function viewComparer(params) {
  const entries = (await db.all('entries')).sort((a, b) => a.date.localeCompare(b.date));
  if (entries.length < 2) return `
    <header class="page-head"><h1>Avant / après</h1></header>
    <div class="card empty"><p>Il faut au moins 2 dessins pour comparer.</p></div>`;
  const a = entries.find((e) => e.id === params.get('a')) || entries[0];
  const b = entries.find((e) => e.id === params.get('b')) || entries[entries.length - 1];
  const opt = (sel) => entries.map((e) => `<option value="${e.id}" ${e.id === sel.id ? 'selected' : ''}>
    ${e.day ? `Jour ${e.day}` : 'Libre'} — ${fmtDate(e.date, { day: 'numeric', month: 'short' })}</option>`).join('');
  return `
  <nav class="crumbs"><a href="#/galerie">← Galerie</a></nav>
  <header class="page-head"><h1>Avant / après</h1></header>
  <div class="compare">
    <figure>
      <select data-compare="a">${opt(a)}</select>
      <img src="${blobUrl(a.photo)}" alt="Avant">
    </figure>
    <figure>
      <select data-compare="b">${opt(b)}</select>
      <img src="${blobUrl(b.photo)}" alt="Après">
    </figure>
  </div>`;
}

function viewFiches() {
  return `
  <header class="page-head"><h1>Fiches mémo</h1></header>
  <div class="fiche-list">
    ${fiches.map((f) => `<a class="card fiche-link" href="#/fiches/${f.id}"><span class="num">${f.id}</span>${esc(f.title)}</a>`).join('')}
  </div>`;
}

function viewFiche(id) {
  const f = fiches.find((x) => x.id === id);
  if (!f) return '<p>Fiche introuvable.</p>';
  return `
  <nav class="crumbs"><a href="#/fiches">← Fiches</a></nav>
  <header class="lesson-head"><p class="kicker">Fiche ${f.id}</p><h1>${esc(f.title)}</h1></header>
  <article class="card prose">${md(f.body)}</article>`;
}

async function viewNuanciers(params) {
  const tab = params.get('tab') || 'couleurs';
  const head = `
  <header class="page-head"><h1>Mes nuanciers</h1></header>
  <nav class="segmented">
    ${[['couleurs', 'Couleurs'], ['palettes', 'Palettes'], ['photos', 'Photos']]
      .map(([k, l]) => `<a href="#/nuanciers?tab=${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}
  </nav>`;

  if (tab === 'palettes') {
    const palettes = await db.all('palettes');
    return head + `
    <p class="hint">Compose tes palettes cozy : 3 ou 4 couleurs douces + une touche vive.</p>
    <button class="btn small" data-action="edit-palette">＋ Nouvelle palette</button>
    ${palettes.map((p) => `
      <button class="card palette" data-action="edit-palette" data-id="${p.id}">
        <strong>${esc(p.nom)}</strong>
        <span class="chips">${p.colors.map((c) => `<span class="chip" style="background:${esc(c.hex)}" title="${esc(c.nom || '')}"></span>`).join('')}</span>
      </button>`).join('') || '<div class="card empty"><p>Aucune palette pour l\'instant.</p></div>'}`;
  }

  if (tab === 'photos') {
    const swatches = (await db.all('swatches')).sort((a, b) => b.date.localeCompare(a.date));
    return head + `
    <p class="hint">Prends en photo tes nuanciers papier pour les avoir toujours sur toi.</p>
    <button class="btn small" data-action="add-swatch">📷 Ajouter une photo de nuancier</button>
    <div class="gallery">${swatches.map((s) => `
      <a class="tile" href="${blobUrl(s.photo)}" target="_blank">
        <img src="${blobUrl(s.thumb)}" alt=""><span>${esc(s.titre)}</span>
      </a>`).join('')}</div>
    ${swatches.length ? `<p class="hint">Pour supprimer une photo, touche ✕ à côté de son titre.</p>
      <ul class="plain">${swatches.map((s) => `<li><button class="linklike" data-action="delete-swatch" data-id="${s.id}">✕ ${esc(s.titre)}</button></li>`).join('')}</ul>` : ''}`;
  }

  const colors = await db.all('colors');
  const groups = GAMMES.map((g) => [g, colors.filter((c) => (c.gamme || 'Autre') === g)]).filter(([, l]) => l.length);
  return head + `
  <p class="hint">Note chaque couleur de ton matériel et <strong>son ombre</strong> (jour 3 du parcours).</p>
  <button class="btn small" data-action="edit-color">＋ Ajouter une couleur</button>
  ${groups.map(([g, list]) => `
    <section class="color-group">
      <h2>${esc(g)}</h2>
      <div class="colors">${list.map((c) => `
        <button class="color" data-action="edit-color" data-id="${c.id}">
          <span class="swatch"><span style="background:${esc(c.hex)}"></span>${c.ombre ? `<span style="background:${esc(c.ombre)}"></span>` : ''}</span>
          <span class="name">${esc(c.nom)}</span>
          ${c.ref ? `<span class="ref">${esc(c.ref)}</span>` : ''}
        </button>`).join('')}</div>
    </section>`).join('') || '<div class="card empty"><p>Ajoute tes premières couleurs !</p></div>'}`;
}

async function viewReglages() {
  const flags = await db.all('flags');
  const lastExport = await db.getMeta('lastExport');
  let storage = '';
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    storage = `<p>Espace utilisé : ${(est.usage / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo. ${persisted ? 'Stockage protégé ✓' : ''}</p>`;
  }
  return `
  <nav class="crumbs"><a href="#/">← Accueil</a></nav>
  <header class="page-head"><h1>Réglages</h1></header>

  <section class="card">
    <h2>💾 Sauvegarde</h2>
    <p>Tes dessins sont stockés uniquement sur ce téléphone. Fais une sauvegarde régulièrement et range-la dans <em>Fichiers</em> ou iCloud Drive.</p>
    <p class="hint">Dernière sauvegarde : ${lastExport ? fmtDate(lastExport, { day: 'numeric', month: 'long', year: 'numeric' }) : 'jamais'}</p>
    ${storage}
    <button class="btn" data-action="export">Exporter ma sauvegarde</button>
    <button class="btn ghost" data-action="import">Restaurer une sauvegarde</button>
  </section>

  <section class="card prose">
    <h2>📱 Installer sur l'iPhone</h2>
    <ol>
      <li>Ouvre cette page dans <strong>Safari</strong>.</li>
      <li>Touche le bouton <strong>Partager</strong> (carré avec une flèche).</li>
      <li>Choisis <strong>Sur l'écran d'accueil</strong>, puis <strong>Ajouter</strong>.</li>
      <li>Ouvre ensuite toujours le carnet depuis son icône : c'est là que tes dessins sont enregistrés.</li>
    </ol>
  </section>

  <section class="card">
    <h2>⚑ Liens signalés</h2>
    ${flags.length ? `<ul class="plain flags">${flags.map((f) => `
      <li><span>Jour ${f.day || '?'} · ${esc(f.note || 'sans note')}<br><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.url)}</a></span>
      <button class="linklike" data-action="unflag" data-url="${esc(f.url)}">Retirer</button></li>`).join('')}</ul>` :
      '<p class="hint">Aucun lien signalé. Dans une leçon, le bouton « Signaler » permet de noter un lien cassé ou pas adapté.</p>'}
  </section>

  <section class="card">
    <h2>Recommencer</h2>
    <p class="hint">Remet le parcours à zéro (les photos sont conservées dans la galerie).</p>
    <button class="btn danger small" data-action="reset-progress">Recommencer le parcours</button>
  </section>`;
}

// --- Dialogues (couleurs, palettes) -------------------------------------------

const dialog = document.getElementById('dialog');

function openDialog(html, onSubmit) {
  dialog.onclick = null;
  dialog.onchange = null;
  dialog.innerHTML = `<form method="dialog" class="dialog-form">${html}</form>`;
  const form = dialog.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    const action = ev.submitter && ev.submitter.value;
    if (action === 'cancel') return;
    ev.preventDefault();
    await onSubmit(new FormData(form), action, form);
    dialog.close();
    route();
  });
  dialog.showModal();
}

async function editColor(id) {
  const c = (id && (await db.get('colors', id))) || { id: uid(), nom: '', ref: '', gamme: 'Feutres à eau', hex: '#c47a5a', ombre: '' };
  openDialog(`
    <h2>${id ? 'Modifier la couleur' : 'Nouvelle couleur'}</h2>
    <label class="field"><span>Nom</span><input name="nom" required value="${esc(c.nom)}" placeholder="Ex. : Terracotta"></label>
    <label class="field"><span>Marque / référence</span><input name="ref" value="${esc(c.ref)}" placeholder="Ex. : Tombow 925"></label>
    <label class="field"><span>Matériel</span><select name="gamme">${GAMMES.map((g) => `<option ${g === c.gamme ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <div class="color-pickers">
      <label class="field"><span>Couleur</span><input type="color" name="hex" value="${esc(c.hex)}"></label>
      <label class="field"><span>Son ombre</span><input type="color" name="ombre" value="${esc(c.ombre || '#6b5b73')}"></label>
    </div>
    <label class="check"><input type="checkbox" name="hasOmbre" ${c.ombre || !id ? 'checked' : ''}> J'ai choisi une ombre pour cette couleur</label>
    <div class="dialog-actions">
      ${id ? '<button class="btn danger small" value="delete">Supprimer</button>' : ''}
      <button class="btn ghost small" value="cancel" formnovalidate>Annuler</button>
      <button class="btn small" value="save">Enregistrer</button>
    </div>`, async (fd, action) => {
    if (action === 'delete') { if (confirm('Supprimer cette couleur ?')) await db.delete('colors', c.id); return; }
    await db.put('colors', {
      ...c, nom: fd.get('nom').trim(), ref: fd.get('ref').trim(), gamme: fd.get('gamme'),
      hex: fd.get('hex'), ombre: fd.get('hasOmbre') ? fd.get('ombre') : '',
    });
  });
}

async function editPalette(id) {
  const colors = await db.all('colors');
  const p = (id && (await db.get('palettes', id))) || { id: uid(), nom: '', colors: [] };
  const chosen = [...p.colors];
  const renderChips = () => `
    ${chosen.map((c, i) => `<button type="button" class="chip big" data-remove="${i}" style="background:${esc(c.hex)}" aria-label="Retirer"></button>`).join('')}
    <label class="chip big add"><input type="color" data-free value="#a3b18a">＋</label>`;
  openDialog(`
    <h2>${id ? 'Modifier la palette' : 'Nouvelle palette'}</h2>
    <label class="field"><span>Nom</span><input name="nom" required value="${esc(p.nom)}" placeholder="Ex. : Matin d'automne"></label>
    <p class="hint">Ta palette (touche une couleur pour la retirer) :</p>
    <div class="chips chosen">${renderChips()}</div>
    ${colors.length ? `<p class="hint">Ajouter depuis mes couleurs :</p>
    <div class="chips">${colors.map((c) => `<button type="button" class="chip big" data-add="${c.id}" style="background:${esc(c.hex)}" title="${esc(c.nom)}"></button>`).join('')}</div>` : ''}
    <div class="dialog-actions">
      ${id ? '<button class="btn danger small" value="delete">Supprimer</button>' : ''}
      <button class="btn ghost small" value="cancel" formnovalidate>Annuler</button>
      <button class="btn small" value="save">Enregistrer</button>
    </div>`, async (fd, action) => {
    if (action === 'delete') { if (confirm('Supprimer cette palette ?')) await db.delete('palettes', p.id); return; }
    await db.put('palettes', { ...p, nom: fd.get('nom').trim(), colors: chosen });
  });
  const box = dialog.querySelector('.chosen');
  const refresh = () => { box.innerHTML = renderChips(); };
  dialog.onclick = (ev) => {
    const add = ev.target.closest('[data-add]');
    const rem = ev.target.closest('[data-remove]');
    if (add) { const c = colors.find((x) => x.id === add.dataset.add); chosen.push({ hex: c.hex, nom: c.nom }); refresh(); }
    if (rem) { chosen.splice(Number(rem.dataset.remove), 1); refresh(); }
  };
  dialog.onchange = (ev) => {
    if (ev.target.matches('[data-free]')) { chosen.push({ hex: ev.target.value, nom: '' }); refresh(); }
  };
}

// --- Actions -----------------------------------------------------------------

async function exportBackup() {
  toast('Préparation de la sauvegarde…');
  const blob = await exportAll();
  const name = `carnet-dessin-${localDay(new Date())}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Sauvegarde carnet de dessin' });
    } else {
      download();
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    download();
  }
  await db.setMeta('lastExport', new Date().toISOString());
  toast('Sauvegarde prête ✓');
  route();
}

const actions = {
  async 'add-photo'(el) {
    const file = await pickFile();
    if (!file) return;
    toast('Enregistrement…');
    await addEntry({ day: Number(el.dataset.day), file });
    toast('Dessin ajouté ✓ Bravo !');
    route();
  },
  async 'add-free'() {
    const file = await pickFile();
    if (!file) return;
    await addEntry({ file });
    toast('Dessin ajouté ✓');
    route();
  },
  async 'toggle-done'(el) {
    const day = Number(el.dataset.day);
    const p = await db.get('progress', day);
    await markDone(day, !(p && p.done));
    route();
  },
  async 'delete-entry'(el) {
    if (!confirm('Supprimer définitivement cette photo ?')) return;
    await db.delete('entries', el.dataset.id);
    history.back();
  },
  'edit-color': (el) => editColor(el.dataset.id),
  'edit-palette': (el) => editPalette(el.dataset.id),
  async 'add-swatch'() {
    const file = await pickFile();
    if (!file) return;
    const titre = prompt('Titre de ce nuancier ?', 'Nuancier feutres à eau') || 'Nuancier';
    const { photo, thumb } = await preparePhoto(file);
    await db.put('swatches', { id: uid(), titre, date: new Date().toISOString(), photo, thumb });
    route();
  },
  async 'delete-swatch'(el) {
    if (!confirm('Supprimer cette photo de nuancier ?')) return;
    await db.delete('swatches', el.dataset.id);
    route();
  },
  export: exportBackup,
  async import() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    if (!confirm('Restaurer cette sauvegarde ? Les données actuelles seront remplacées.')) return;
    try {
      await importAll(file);
      toast('Sauvegarde restaurée ✓');
      route();
    } catch (err) {
      toast(err.message);
    }
  },
  async unflag(el) {
    await db.delete('flags', el.dataset.url);
    route();
  },
  async 'reset-progress'() {
    if (!confirm('Remettre le parcours à zéro ? Tes photos restent dans la galerie.')) return;
    await db.clear('progress');
    toast('Parcours remis à zéro');
    location.hash = '#/';
  },
};

view.addEventListener('click', async (ev) => {
  const flag = ev.target.closest('[data-flag]');
  if (flag) {
    const url = flag.dataset.flag;
    if (await db.get('flags', url)) {
      await db.delete('flags', url);
      flag.textContent = 'Signaler';
      flag.classList.remove('flagged');
      return;
    }
    const note = prompt('Qu\'est-ce qui ne va pas ? (lien cassé, pas en français, pas adapté…)', 'Lien cassé');
    if (note === null) return;
    const day = Number((location.hash.match(/jour\/(\d+)/) || [])[1]) || null;
    await db.put('flags', { url, day, note, date: new Date().toISOString() });
    flag.textContent = 'Signalé ✓';
    flag.classList.add('flagged');
    return;
  }
  const el = ev.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) {
    ev.preventDefault();
    try {
      await actions[el.dataset.action](el);
    } catch (err) {
      console.error(err);
      toast('Oups : ' + err.message);
    }
  }
});

let noteTimer;
view.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!t.matches('[data-note-day], [data-note-entry]')) return;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(async () => {
    if (t.dataset.noteDay) {
      const day = Number(t.dataset.noteDay);
      const p = (await db.get('progress', day)) || { day, done: false };
      await db.put('progress', { ...p, note: t.value });
    } else {
      const e = await db.get('entries', t.dataset.noteEntry);
      if (e) await db.put('entries', { ...e, note: t.value });
    }
  }, 400);
});

view.addEventListener('change', (ev) => {
  const sel = ev.target.closest('[data-compare]');
  if (!sel) return;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  params.set(sel.dataset.compare, sel.value);
  for (const s of view.querySelectorAll('[data-compare]')) params.set(s.dataset.compare, s.value);
  location.hash = '#/comparer?' + params.toString();
});

// --- Routeur -----------------------------------------------------------------

async function route() {
  const [path, query] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(query || '');
  const parts = path.split('/').filter(Boolean);
  const oldUrls = takeUrls();
  let html;
  let tab = '';
  switch (parts[0]) {
    case undefined: html = await viewToday(); tab = 'today'; break;
    case 'parcours': html = await viewParcours(); tab = 'parcours'; break;
    case 'jour': html = await viewDay(Number(parts[1])); tab = 'parcours'; break;
    case 'galerie': html = await viewGalerie(); tab = 'galerie'; break;
    case 'photo': html = await viewPhoto(parts[1]); tab = 'galerie'; break;
    case 'comparer': html = await viewComparer(params); tab = 'galerie'; break;
    case 'fiches': html = parts[1] ? viewFiche(Number(parts[1])) : viewFiches(); tab = 'fiches'; break;
    case 'nuanciers': html = await viewNuanciers(params); tab = 'nuanciers'; break;
    case 'reglages': html = await viewReglages(); tab = 'today'; break;
    default: html = await viewToday(); tab = 'today';
  }
  view.innerHTML = html;
  for (const u of oldUrls) URL.revokeObjectURL(u);
  for (const a of tabs) a.classList.toggle('on', a.dataset.tab === tab);
  if (route.lastPath !== path) window.scrollTo(0, 0);
  route.lastPath = path;
}

async function start() {
  const [p, f] = await Promise.all([
    fetch('contenu/programme-30-jours.md').then((r) => r.text()),
    fetch('contenu/fiches-memo.md').then((r) => r.text()),
  ]);
  programme = parseProgramme(p);
  fiches = parseFiches(f);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  window.addEventListener('hashchange', route);
  await route();
}

start().catch((err) => {
  view.innerHTML = `<div class="card"><p>Le carnet n'a pas pu s'ouvrir : ${esc(err.message)}</p></div>`;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
