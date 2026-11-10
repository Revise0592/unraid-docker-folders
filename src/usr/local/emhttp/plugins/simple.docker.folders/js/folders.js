/* Simple Docker Folders - groups containers on the Unraid Docker tab and Dashboard into collapsible folders. */
(function () {
  'use strict';

  const BASE = '/plugins/simple.docker.folders';
  const API = BASE + '/include/api.php';
  const EVENTS = '/plugins/dynamix.docker.manager/include/Events.php';
  const OPEN_KEY = 'sdf.open';

  const list = document.getElementById('docker_list'); // Docker tab table body
  const dash = document.getElementById('docker_view'); // Dashboard "Docker Containers" tile
  if (!list && !dash) return; // neither view (e.g. Add/Edit Container, docker disabled)

  let data = normalize(window.SDF_DATA);
  const busy = new Set();
  const open = new Set(readOpen());

  // ---------- helpers ----------

  function normalize(d) {
    return d && Array.isArray(d.folders) ? d : { folders: [] };
  }

  function readOpen() {
    try { return JSON.parse(localStorage.getItem(OPEN_KEY)) || []; } catch (e) { return []; }
  }

  function writeOpen() {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...open])); } catch (e) { /* private mode */ }
  }

  function h(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid != null && kid !== false) node.append(kid instanceof Node ? kid : String(kid));
    }
    return node;
  }

  // jQuery POST so Unraid's ajaxPrefilter appends the CSRF token.
  function post(url, body) {
    return new Promise((resolve, reject) => {
      window.$.post(url, body, null, 'json')
        .done(resolve)
        .fail((xhr) => reject(new Error((xhr.responseJSON && xhr.responseJSON.error) || xhr.statusText || 'Request failed')));
    });
  }

  // Unraid fills the global `docker` array with {name, id, state, pause} on every list load.
  function containerInfo() {
    const map = new Map();
    for (const c of (Array.isArray(window.docker) ? window.docker : [])) map.set(c.name, c);
    return map;
  }

  function iconUrl(folder) {
    return folder.icon ? `${BASE}/include/icon.php?id=${folder.id}&v=${folder.icon}` : null;
  }

  function folderIcon(folder) {
    const url = iconUrl(folder);
    return url ? h('img', { class: 'img', src: url, alt: '' }) : h('i', { class: 'fa fa-folder img sdf-default-icon' });
  }

  // ---------- grouping ----------

  function render() {
    const target = list || dash;
    observer.disconnect();
    try { if (list) group(); else groupDashboard(); } finally { observer.observe(target, { childList: true }); }
  }

  function folderStatus(running, total) {
    const status = !total || running === 0 ? 'stopped' : running === total ? 'started' : 'partial';
    return {
      status,
      color: { started: 'green-text', partial: 'orange-text', stopped: 'red-text' }[status],
      shape: status === 'stopped' ? 'square' : 'play',
    };
  }

  function group() {
    list.querySelectorAll(':scope > tr.sdf-folder').forEach((r) => r.remove());

    const rows = new Map(); // container name -> row, in Unraid's order
    for (const tr of list.querySelectorAll(':scope > tr.sortable')) {
      tr.classList.remove('sdf-member', 'sdf-hidden');
      const name = tr.querySelector('td.ct-name .appname');
      if (name) rows.set(name.textContent.trim(), tr);
    }
    if (!rows.size) return; // list not loaded yet, or no containers

    const position = new Map([...rows.keys()].map((n, i) => [n, i]));
    const info = containerInfo();
    const cols = list.closest('table').querySelectorAll('thead th').length || 10;
    const claimed = new Set();

    const folders = data.folders.map((f) => {
      const members = f.containers
        .filter((n) => rows.has(n) && !claimed.has(n))
        .sort((a, b) => position.get(a) - position.get(b));
      members.forEach((n) => claimed.add(n));
      return { folder: f, members, at: members.length ? position.get(members[0]) : Infinity };
    }).sort((a, b) => a.at - b.at);

    for (const { folder, members } of folders) {
      const row = folderRow(folder, members, info, cols);
      const isOpen = open.has(folder.id);
      if (members.length) rows.get(members[0]).before(row); else list.append(row);
      let prev = row;
      for (const name of members) {
        const tr = rows.get(name);
        tr.classList.add('sdf-member');
        if (!isOpen) tr.classList.add('sdf-hidden');
        prev.after(tr);
        prev = tr;
      }
    }
  }

  function folderRow(folder, members, info, cols) {
    const running = members.filter((n) => info.get(n) && info.get(n).state).length;
    const { status, color, shape } = folderStatus(running, members.length);
    const isBusy = busy.has(folder.id);
    const isOpen = open.has(folder.id);

    const action = (icon, title, fn) => h('a', {
      class: 'sdf-btn', title, href: '#',
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); if (!busy.has(folder.id)) fn(); },
    }, h('i', { class: `fa fa-${icon}` }));

    return h('tr', {
      class: 'sdf-folder' + (isOpen ? ' sdf-open' : ''),
      'data-id': folder.id,
      onclick: () => toggle(folder.id),
    },
      h('td', { class: 'sdf-name' },
        h('i', { class: 'fa fa-chevron-right sdf-caret' }),
        h('span', { class: `outer ${status}` },
          folderIcon(folder),
          h('span', { class: 'inner' },
            h('span', { class: 'sdf-title' }, folder.name),
            h('br'),
            isBusy
              ? h('i', { class: 'fa fa-spin fa-circle-o-notch' })
              : h('i', { class: `fa fa-${shape} ${color}` }),
            h('span', { class: 'state' }, `${running}/${members.length} started`)))),
      h('td', { colspan: cols - 1, class: 'sdf-actions' },
        action('play', 'Start all in folder', () => run(folder, 'start')),
        action('stop', 'Stop all in folder', () => run(folder, 'stop')),
        action('refresh', 'Restart running in folder', () => run(folder, 'restart')),
        action('pencil', 'Edit folder', () => editor(folder))));
  }

  // ---------- dashboard ----------

  // DashboardApps.php renders each container as
  //   <span class="outer solid apps started|paused|stopped"><span id=… class="hand">icon</span>
  //   <span class="inner"><span>name</span><br>…</span></span>
  // inside a single cell of #docker_view, rebuilt on every loadlist().
  function groupDashboard() {
    dash.querySelectorAll('span.sdf-folder').forEach((el) => el.remove());

    const tiles = new Map(); // container name -> tile, in Unraid's order
    for (const el of dash.querySelectorAll('span.outer.apps')) {
      el.classList.remove('sdf-member', 'sdf-hidden');
      const name = el.querySelector(':scope > .inner > span');
      if (name) tiles.set(name.textContent.trim(), el);
    }
    if (!tiles.size) return;

    // Unraid's "Started only" switch hides stopped tiles itself; we apply it to folder members too,
    // because jQuery's toggle() gets confused by tiles we have hidden.
    const switchEl = document.getElementById('apps');
    const startedOnly = !!(switchEl && switchEl.checked);
    const position = new Map([...tiles.keys()].map((n, i) => [n, i]));
    const claimed = new Set();

    const folders = data.folders.map((f) => {
      const members = f.containers
        .filter((n) => tiles.has(n) && !claimed.has(n))
        .sort((a, b) => position.get(a) - position.get(b));
      members.forEach((n) => claimed.add(n));
      return { folder: f, members };
    }).filter((f) => f.members.length);

    for (const { folder, members } of folders) {
      const isOpen = open.has(folder.id);
      const running = members.filter((n) => !tiles.get(n).classList.contains('stopped')).length;
      const { status, color, shape } = folderStatus(running, members.length);

      // `apps` (without started/stopped/paused) keeps Unraid's noApps() check correct
      // while leaving its started/stopped counters untouched.
      const tile = h('span', {
        class: `outer solid apps sdf-folder sdf-${status}` + (isOpen ? ' sdf-open' : ''),
        'data-id': folder.id,
        title: `${isOpen ? 'Collapse' : 'Expand'} ${folder.name}`,
        onclick: () => toggle(folder.id),
      },
        h('span', { class: 'sdf-hand' }, folderIcon(folder)),
        h('span', { class: 'inner' },
          h('span', { class: 'sdf-title' }, h('i', { class: 'fa fa-chevron-right sdf-caret' }), folder.name),
          h('br'),
          h('i', { class: `fa fa-${shape} ${color}` }),
          h('span', { class: 'state' }, `${running}/${members.length} started`)));
      if (startedOnly && running === 0) tile.classList.add('sdf-hidden');

      tiles.get(members[0]).before(tile);
      let prev = tile;
      for (const name of members) {
        const el = tiles.get(name);
        el.classList.add('sdf-member');
        el.style.display = '';
        if (!isOpen || (startedOnly && el.classList.contains('stopped'))) el.classList.add('sdf-hidden');
        prev.after(el);
        prev = el;
      }
    }

    if (typeof window.noApps === 'function') window.noApps();
  }

  function toggle(id) {
    if (open.has(id)) open.delete(id); else open.add(id);
    writeOpen();
    render();
  }

  async function run(folder, action) {
    const info = containerInfo();
    const members = folder.containers.map((n) => info.get(n)).filter(Boolean);
    let targets = action === 'start' ? members.filter((c) => !c.state) : members.filter((c) => c.state);
    if (action === 'stop') targets = targets.reverse();
    if (!targets.length) return;

    busy.add(folder.id);
    render();
    const errors = [];
    for (const c of targets) {
      try {
        const res = await post(EVENTS, { action, container: c.id });
        if (res.success !== true) errors.push(`${c.name}: ${res.success || res.error}`);
      } catch (e) {
        errors.push(`${c.name}: ${e.message}`);
      }
    }
    busy.delete(folder.id);
    if (errors.length) alert(errors.join('\n'));
    if (typeof window.loadlist === 'function') window.loadlist(); else render();
  }

  // ---------- editor ----------

  function toPng(file) {
    return new Promise((resolve, reject) => {
      const src = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const S = 128;
        const w = img.naturalWidth || S;
        const hgt = img.naturalHeight || S;
        const k = Math.min(S / w, S / hgt);
        const canvas = h('canvas', { width: S, height: S });
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (S - w * k) / 2, (S - hgt * k) / 2, w * k, hgt * k);
        URL.revokeObjectURL(src);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Could not read that image.')); };
      img.src = src;
    });
  }

  function editor(folder) {
    const isNew = !folder;
    folder = folder || { id: '', name: '', containers: [], icon: 0 };
    let icon = 'keep'; // 'keep' | 'remove' | data URL

    const owner = new Map();
    for (const f of data.folders) if (f.id !== folder.id) for (const n of f.containers) owner.set(n, f.name);
    // Containers already in another folder go to the bottom (stable sort keeps Unraid's order otherwise).
    const names = (Array.isArray(window.docker) ? window.docker : []).map((c) => c.name)
      .sort((a, b) => owner.has(a) - owner.has(b));

    const nameInput = h('input', { type: 'text', maxlength: 64, value: folder.name, placeholder: 'Folder name' });
    const preview = h('span', { class: 'sdf-preview' }, folderIcon(folder));
    const fileInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    const removeBtn = h('input', { type: 'button', value: 'Remove image' });
    removeBtn.style.display = folder.icon ? '' : 'none';
    const error = h('div', { class: 'sdf-error red-text' });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      try {
        icon = await toPng(file);
        preview.replaceChildren(h('img', { class: 'img', src: icon, alt: '' }));
        removeBtn.style.display = '';
      } catch (e) { error.textContent = e.message; }
    });
    removeBtn.addEventListener('click', () => {
      icon = 'remove';
      preview.replaceChildren(h('i', { class: 'fa fa-folder img sdf-default-icon' }));
      removeBtn.style.display = 'none';
    });

    const checks = names.map((n) => h('label', { class: 'sdf-check' },
      h('input', { type: 'checkbox', value: n, checked: folder.containers.includes(n) }),
      ' ', n,
      owner.has(n) ? h('span', { class: 'sdf-owner' }, ` (in ${owner.get(n)})`) : null));

    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };

    async function submit(body) {
      error.textContent = '';
      dialog.querySelectorAll('input').forEach((i) => { i.disabled = true; });
      try {
        data = normalize(await post(API, body));
        close();
        render();
      } catch (e) {
        error.textContent = e.message;
        dialog.querySelectorAll('input').forEach((i) => { i.disabled = false; });
      }
    }

    const save = () => {
      const name = nameInput.value.trim();
      if (!name) { error.textContent = 'Give the folder a name.'; nameInput.focus(); return; }
      const containers = checks.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
      submit({ action: 'save', id: folder.id, name, containers, icon });
    };
    const del = () => {
      if (confirm(`Delete folder "${folder.name}"? Containers are not affected.`)) submit({ action: 'delete', id: folder.id });
    };

    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

    const dialog = h('div', { class: 'sdf-dialog', role: 'dialog', 'aria-modal': 'true' },
      h('h3', null, isNew ? 'New folder' : 'Edit folder'),
      h('div', { class: 'sdf-row' }, preview, nameInput),
      h('div', { class: 'sdf-row' },
        h('input', { type: 'button', value: 'Choose image…', onclick: () => fileInput.click() }),
        removeBtn, fileInput),
      h('div', { class: 'sdf-label' }, 'Containers'),
      h('div', { class: 'sdf-list' }, checks.length ? checks : h('em', null, 'No containers found.')),
      error,
      h('div', { class: 'sdf-buttons' },
        isNew ? null : h('input', { type: 'button', value: 'Delete', class: 'sdf-delete', onclick: del }),
        h('input', { type: 'button', value: 'Cancel', onclick: close }),
        h('input', { type: 'button', value: 'Save', onclick: save })));

    const overlay = h('div', { class: 'sdf-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } }, dialog);

    // Match whatever Unraid theme is active (6.12 has no CSS variables).
    const body = getComputedStyle(document.body);
    dialog.style.backgroundColor = body.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#fff' : body.backgroundColor;
    dialog.style.color = body.color;

    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    nameInput.focus();
  }

  // ---------- boot ----------

  // Unraid replaces #docker_list's rows / #docker_view's tile row on every refresh; regroup each time.
  // Only direct children are watched, so the live CPU/memory updates don't trigger this.
  const observer = new MutationObserver(render);
  render();

  if (list) {
    const actions = document.querySelector('.js-actions');
    if (actions) actions.append(h('input', { type: 'button', value: 'Add Folder', onclick: () => editor(null) }));
  } else if (window.$) {
    // The switch fires a jQuery-triggered change and then animates for 'fast' (200ms); regroup after it settles.
    window.$('#apps').on('change', () => setTimeout(render, 300));
  }
})();
