// Mini lecteur Markdown, juste ce qu'il faut pour le programme et les fiches.

const URL_RE = /(https?:\/\/[^\s<)]+)/g;

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(URL_RE, (url) => {
    const clean = url.replace(/[.,;]+$/, '');
    const rest = url.slice(clean.length);
    return `<a href="${clean}" target="_blank" rel="noopener">${shortUrl(clean)}</a>${rest}`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s;
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Une ligne de ressource : "📄 Titre : https://…" ou "▶️ Titre : https://…"
function resourceCard(text) {
  const m = text.match(/^(📄|▶️)\s*(.*?)\s*:?\s*(https?:\/\/\S+)(.*)$/u);
  if (!m) return null;
  const [, icon, title, url, extra] = m;
  const isVideo = icon === '▶️';
  return `<div class="resource ${isVideo ? 'video' : 'article'}">
    <span class="resource-icon" aria-hidden="true">${isVideo ? '▶' : '✎'}</span>
    <div class="resource-body">
      <div class="resource-title">${inline(title)}</div>
      ${extra.trim() ? `<div class="resource-extra">${inline(extra.trim())}</div>` : ''}
      <div class="resource-actions">
        <a class="btn small" href="${escapeHtml(url)}" target="_blank" rel="noopener">${isVideo ? 'Voir la vidéo' : 'Lire'}</a>
        <button class="btn small ghost" data-flag="${escapeHtml(url)}">Signaler</button>
      </div>
    </div>
  </div>`;
}

function parseList(lines, start) {
  // Renvoie [html, indexSuivant]
  const baseIndent = lines[start].match(/^\s*/)[0].length;
  const ordered = /^\s*\d+\.\s/.test(lines[start]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // une ligne vide termine la liste sauf si la suite est encore un élément au même niveau
      const next = lines[i + 1];
      if (next && new RegExp(`^\\s{${baseIndent}}(?:[-*]|\\d+\\.)\\s`).test(next)) { i++; continue; }
      break;
    }
    const indent = line.match(/^\s*/)[0].length;
    const itemMatch = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      if (itemMatch) {
        const [html, next] = parseList(lines, i);
        items[items.length - 1].children.push(html);
        i = next;
        continue;
      }
      items[items.length - 1].text += ' ' + line.trim();
      i++;
      continue;
    }
    if (!itemMatch) break;
    items.push({ text: itemMatch[1], children: [] });
    i++;
  }
  const allResources = items.every((it) => resourceCard(it.text));
  if (allResources) {
    return [`<div class="resources">${items.map((it) => resourceCard(it.text)).join('')}</div>`, i];
  }
  const tag = ordered ? 'ol' : 'ul';
  const html = `<${tag}>${items
    .map((it) => `<li>${resourceCard(it.text) || inline(it.text)}${it.children.join('')}</li>`)
    .join('')}</${tag}>`;
  return [html, i];
}

function parseTable(lines, start) {
  const rows = [];
  let i = start;
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    i++;
  }
  const [head, , ...body] = rows;
  const html = `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
  return [html, i];
}

export function render(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length + 1, 5);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${render(buf.join('\n'))}</blockquote>`);
      continue;
    }
    if (line.trim().startsWith('|')) {
      const [html, next] = parseTable(lines, i);
      out.push(html);
      i = next;
      continue;
    }
    if (/^\s*(?:[-*]|\d+\.)\s/.test(line)) {
      const [html, next] = parseList(lines, i);
      out.push(html);
      i = next;
      continue;
    }
    const buf = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,4}\s|>|\||---|\s*(?:[-*]|\d+\.)\s)/.test(lines[i])
    ) buf.push(lines[i++]);
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

// --- Découpage du programme en semaines et en jours ------------------------

export function parseProgramme(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const programme = { title: '', intro: [], weeks: [], days: [] };
  let week = null;
  let day = null;
  for (const line of lines) {
    let m;
    if ((m = line.match(/^#\s+(.*)$/))) { programme.title = m[1]; continue; }
    if ((m = line.match(/^##\s+(.*)$/))) {
      day = null;
      week = { title: m[1], intro: [], days: [] };
      programme.weeks.push(week);
      continue;
    }
    if ((m = line.match(/^###\s+Jour\s+(\d+)\s+—\s+(.*)$/))) {
      day = { n: Number(m[1]), title: m[2], body: [], week: programme.weeks.length };
      day.free = /libre/i.test(day.title);
      week.days.push(day);
      programme.days.push(day);
      continue;
    }
    if (/^---+\s*$/.test(line)) continue;
    if (day) day.body.push(line);
    else if (week) week.intro.push(line);
    else programme.intro.push(line);
  }
  const clean = (arr) => arr.join('\n').trim();
  programme.intro = clean(programme.intro);
  for (const w of programme.weeks) w.intro = clean(w.intro);
  for (const d of programme.days) d.body = clean(d.body);
  return programme;
}

export function parseFiches(md) {
  const fiches = [];
  let cur = null;
  for (const line of md.replace(/\r/g, '').split('\n')) {
    const m = line.match(/^##\s+(?:\d+\.\s*)?(.*)$/);
    if (m) { cur = { title: m[1], body: [] }; fiches.push(cur); continue; }
    if (cur) cur.body.push(line);
  }
  return fiches.map((f, i) => ({ id: i + 1, title: f.title, body: f.body.join('\n').trim() }));
}
