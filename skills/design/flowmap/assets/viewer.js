// The flowmap page's behaviour: pan and zoom, the panel, rules, claims and flows.
// html.mjs inlines it after the page's JSON blocks (fm-source, fm-claims, fm-rules, fm-flows, fm-config).
(() => {
  const read = (id) => JSON.parse(document.getElementById(id).textContent);
  const config = read('fm-config');
  const source = read('fm-source');
  const claims = read('fm-claims');
  const rules = read('fm-rules');
  const flows = read('fm-flows');
  const box = document.getElementById('diagram');
  const detail = document.getElementById('detail');
  const rail = document.getElementById('rail');
  const live = document.getElementById('fm-live');
  const roLabel = document.getElementById('ro-label');
  const roStep = document.getElementById('ro-step');
  let selected = null;
  let activeFlow = null; // flow index, or null for All
  let flowMode = 'highlight'; // 'highlight' | 'solo'
  let stepIdx = -1; // active step index inside a 'steps' flow, -1 = overview
  let mounted = null;
  let mountedSource = source;

  // Map each box/arrow id to the flow indices that contain it, for quick pivoting in the inspector.
  const flowsOf = {};
  flows.forEach((f, i) => {
    for (const id of f.ids) (flowsOf[id] ??= []).push(i);
  });

  const text = (tag, cls, value) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = value;
    return el;
  };
  const light = (ids) => {
    box.querySelectorAll('.fm-on').forEach((el) => el.classList.remove('fm-on'));
    const soloMap = activeFlow !== null && flowMode === 'solo' ? flows[activeFlow].soloMap : null;
    const rev = soloMap ? Object.fromEntries(Object.entries(soloMap).map(([s, f]) => [f, s])) : null;
    for (const id of ids) {
      const domId = rev?.[id] ?? id;
      box.querySelector('[data-id="' + CSS.escape(domId) + '"]')?.classList.add('fm-on');
    }
  };

  // Dim what is outside the active flow, on the board and in the minimap alike.
  // A hovered card in the rail's index previews its flow the same way, without moving the camera.
  let preview = null;
  const applyFocus = () => {
    const fi = activeFlow ?? preview;
    const spotlight = fi !== null && (activeFlow === null || flowMode === 'highlight');
    for (const root of [box, document.getElementById('mm-art')]) {
      root.querySelectorAll('.fm-in').forEach((el) => el.classList.remove('fm-in'));
      root.classList.toggle('fm-focus', spotlight);
      if (!spotlight) continue;
      for (const id of flows[fi].ids) {
        root.querySelectorAll('[data-id="' + CSS.escape(id) + '"]').forEach((el) => el.classList.add('fm-in'));
      }
    }
  };

  const swapSource = (nextSource) => {
    if (nextSource === mountedSource || !mounted) return;
    mountedSource = nextSource;
    mounted.update(nextSource);
    box.scrollLeft = 0;
    box.scrollTop = 0;
  };

  // The rail mirrors the state: the index or the open flow, its mode and step, and the board's reopen button.
  let railView = 'index';
  const syncRail = () => {
    if (!rail) return;
    const view = activeFlow === null ? 'index' : String(activeFlow);
    if (view !== railView) {
      // Keep keyboard focus in the rail when the view it sat in goes away.
      const hadFocus = rail.contains(document.activeElement);
      const back = view === 'index';
      const from = back ? Number(railView) : null;
      railView = view;
      rail.dataset.view = back ? 'index' : 'flow';
      rail.querySelectorAll('.rv').forEach((sec) => {
        const on = back ? sec.id === 'rv-index' : sec.dataset.fv === view;
        sec.hidden = !on;
        sec.classList.remove('enter');
        if (on && !reduceMotion.matches) { void sec.offsetWidth; sec.classList.add('enter'); }
      });
      const fresh = back ? null : rail.querySelector('[data-fv="' + view + '"]');
      if (fresh) fresh.querySelector('.fv-steps, .fv-boxes').scrollTop = 0;
      if (hadFocus) {
        if (back) rail.querySelector('.fcard[data-flow="' + from + '"]')?.focus({ preventScroll: false });
        else fresh.querySelector('.fv-title').focus({ preventScroll: true });
      }
      rail.querySelectorAll('.fcard.peek').forEach((c) => c.classList.remove('peek'));
    }
    document.querySelectorAll('.fcard[data-flow]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.flow) === activeFlow)));
    document.querySelectorAll('[data-fmode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fmode === flowMode)));
    roStep.hidden = true;
    if (activeFlow === null) { roLabel.textContent = 'All flows'; return; }
    const f = flows[activeFlow];
    roLabel.textContent = f.label;
    const sec = rail.querySelector('[data-fv="' + activeFlow + '"]');
    if (f.kind === 'steps' && f.stepLabels?.length) {
      const total = f.stepLabels.length;
      const pos = sec.querySelector('.fl-pos');
      if (stepIdx >= 0) {
        pos.replaceChildren('Step ', text('b', '', String(stepIdx + 1)), ' of ' + total);
        roStep.hidden = false;
        roStep.textContent = (stepIdx + 1) + '/' + total;
      } else pos.textContent = total + ' steps';
      sec.querySelector('[data-prev]').disabled = stepIdx <= 0;
      const next = sec.querySelector('[data-next]');
      next.disabled = stepIdx >= total - 1;
      sec.querySelector('[data-fill]').style.width = (stepIdx < 0 ? 0 : ((stepIdx + 1) / total) * 100) + '%';
      sec.querySelectorAll('.fv-steps li').forEach((li, i) => {
        li.classList.toggle('done', stepIdx >= 0 && i < stepIdx);
        li.classList.toggle('cur', i === stepIdx);
        const b = li.querySelector('button');
        if (i === stepIdx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      const cur = sec.querySelector('.fv-steps li.cur');
      if (cur && railOpen) cur.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    } else {
      sec.querySelectorAll('[data-box]').forEach((b) => b.classList.toggle('sel', b.dataset.box === selected));
    }
  };
  const say = (msg) => { if (live) live.textContent = msg; };

  const main = document.querySelector('main');
  const emptyDetail = detail.innerHTML;
  const closeIcon = config.icons.close;
  const copyIcon = config.icons.copy;
  const checkIcon = config.icons.check;
  const chevIcon = '<svg class="j-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';
  // The card's head: icon tile (tinted by cardTone), what it is, a status pill, and a clear button.
  const lead = (tag, status, statusTone, cardTone) => {
    const top = document.createElement('div');
    top.className = 'top';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'icon-btn clear';
    clear.title = 'Clear the selection (Esc)';
    clear.innerHTML = closeIcon + '<span class="sr">Clear the selection</span>';
    clear.addEventListener('click', () => show(activeFlow !== null ? 'flow:' + activeFlow : null));
    top.append(text('span', 'tag', tag), text('span', 'pill ' + (statusTone || 'plain'), status), clear);
    detail.className = 'detail on' + (cardTone ? ' ' + cardTone : '');
    detail.append(top);
  };
  // Everything in the card is a group: a small heading over rows of one shape,
  // [icon or key] [title, faint subline] [meta] [action], so sources, ends and flows read alike.
  const ICONS = {
    file: '<path d="M4 1.8h5.2L12.5 5v9.2H4z"/><path d="M9 1.8V5h3.5"/>',
    link: '<path d="M6.8 9.2a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0-4-4l-.8.8"/><path d="M9.2 6.8a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 0 0 4 4l.8-.8"/>',
    note: '<path d="M3 4h10M3 8h10M3 12h6"/>',
    from: '<circle cx="5" cy="8" r="2.4"/><path d="M7.4 8h6M11 5.5 13.5 8 11 10.5"/>',
    to: '<path d="M2.5 8h6M6.5 5.5 9 8l-2.5 2.5"/><rect x="10.5" y="4" width="3.2" height="8" rx="1"/>',
  };
  const icon = (name) => { const el = document.createElement('span'); el.className = 'r-icon'; el.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">' + ICONS[name] + '</svg>'; return el; };
  const group = (label) => {
    const g = document.createElement('div');
    g.className = 'd-group';
    const rows = document.createElement('div');
    rows.className = 'd-rows';
    g.append(text('div', 'd-head', label), rows);
    detail.append(g);
    return rows;
  };
  const row = ({ lead, title, sub, meta, onClick, current, action }) => {
    const r = document.createElement(onClick ? 'button' : 'div');
    if (onClick) { r.type = 'button'; r.addEventListener('click', onClick); }
    r.className = 'd-row' + (onClick ? ' go' : '') + (current ? ' cur' : '');
    const leadEl = document.createElement('span');
    leadEl.className = 'r-lead';
    leadEl.append(lead);
    const main = document.createElement('span');
    main.className = 'r-main';
    main.append(text('span', 'r-title', title));
    if (sub) main.append(text('span', 'r-sub', sub));
    r.append(leadEl, main);
    if (meta) r.append(text('span', 'r-meta', meta));
    const act = document.createElement('span');
    act.className = 'r-act';
    if (action) act.append(action);
    else if (onClick) act.innerHTML = chevIcon;
    r.append(act);
    return r;
  };
  // A source as a row: the file name, the folder under it, the line as meta, and a copy button.
  const sourceRow = (s) => {
    const isUrl = /^[a-z]+:\/\//i.test(s);
    const cut = isUrl ? -1 : s.search(/[\s,]/);
    const path = cut < 0 ? s : s.slice(0, cut);
    const rest = cut < 0 ? '' : s.slice(cut).replace(/^[\s,]+/, '');
    const isPath = !isUrl && /[./#]/.test(path) && !/\s/.test(path);
    let lead = 'note', title = s, sub = '', meta = '';
    if (isPath) {
      const slash = path.lastIndexOf('/');
      title = path.slice(slash + 1);
      const m = title.match(/^(.*?)(?::(\d+(?:-\d+)?)|(#.+))$/);
      if (m) { title = m[1]; meta = m[2] ? 'L' + m[2].replace('-', '–') : m[3]; }
      if (rest) title += ' · ' + rest;
      sub = slash > 0 ? path.slice(0, slash) : '';
      lead = 'file';
    } else if (isUrl) {
      lead = 'link';
      try { const u = new URL(s); title = u.host; sub = (u.pathname + u.search + u.hash).replace(/^\/$/, ''); } catch { /* keep whole */ }
    }
    let copy = null;
    if (navigator.clipboard) {
      copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'copy';
      copy.title = 'Copy source';
      copy.setAttribute('aria-label', 'Copy source');
      copy.innerHTML = copyIcon;
      copy.addEventListener('click', () => {
        navigator.clipboard.writeText(s).then(() => {
          copy.classList.add('done');
          copy.innerHTML = checkIcon;
          copy.title = 'Copied';
          setTimeout(() => { copy.classList.remove('done'); copy.innerHTML = copyIcon; copy.title = 'Copy source'; }, 1300);
        }).catch(() => {});
      });
    }
    return row({ lead: icon(lead), title, sub, meta, action: copy });
  };
  const selectAndReveal = (id) => {
    show(id);
    const soloMap = activeFlow !== null && flowMode === 'solo' ? flows[activeFlow].soloMap : null;
    const domId = soloMap ? Object.keys(soloMap).find((k) => soloMap[k] === id) ?? id : id;
    const el = box.querySelector('[data-id="' + CSS.escape(domId) + '"]');
    if (el) reveal(el, { minK: READABLE, maxK: Math.max(cam.k, READABLE) });
  };

  // Bring boxes or arrows into view by moving the board camera (never the page). Leaves the view alone
  // when they are on screen at a readable zoom; else frames them, zooming out no further than minK
  // (a long flow that cannot fit at minK is shown from its start) and in no further than maxK.
  const reveal = (els, { minK = 0.6, maxK = Math.max(cam.k, minK) } = {}) => {
    const list = els instanceof Element ? [els] : [...els];
    if (!list.length || !svgEl) return;
    const v = box.getBoundingClientRect();
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const el of list) {
      const q = el.getBoundingClientRect();
      if (!q.width && !q.height) continue;
      l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    }
    if (l === Infinity) return;
    const p = pad();
    const onScreen = l >= v.left + p.left && r <= v.right - p.right && t >= v.top + p.top && b <= v.bottom - p.bottom;
    if (onScreen && cam.k >= minK - 1e-3) return;
    const g = { x: (l - v.left - cam.x) / cam.k, y: (t - v.top - cam.y) / cam.k, w: (r - l) / cam.k, h: (b - t) / cam.k };
    const target = frame(g, maxK);
    if (target.k < minK) {
      // Too big to show whole and readable: readable size, centered across, from the top.
      const aw = box.clientWidth - p.left - p.right;
      target.k = minK;
      target.x = p.left + aw / 2 - (g.x + g.w / 2) * minK;
      target.y = p.top - g.y * minK;
    }
    animateTo(target);
  };

  const gotoStep = (idx) => {
    if (activeFlow === null) return;
    const f = flows[activeFlow];
    if (f.kind !== 'steps' || !f.stepNodeIds?.length) return;
    stepIdx = Math.max(0, Math.min(f.stepNodeIds.length - 1, idx));
    const nodeId = f.stepNodeIds[stepIdx];
    const edgeId = stepIdx > 0 ? f.stepEdgeIds[stepIdx - 1] : null;
    show(nodeId, edgeId ? [nodeId, edgeId] : [nodeId]);
    syncRail();
    say('Step ' + (stepIdx + 1) + ' of ' + f.stepLabels.length + ': ' + f.stepLabels[stepIdx]);
    // Follow the step at a readable size, so stepping through a long flow is never a zoomed-out blur.
    const lit = box.querySelector('.pele-node.fm-on');
    if (lit) reveal(lit, { minK: READABLE, maxK: Math.max(cam.k, READABLE) });
  };

  const setFlow = (index, mode = flowMode) => {
    const changed = index !== activeFlow;
    activeFlow = index;
    flowMode = mode;
    if (changed) stepIdx = -1;
    // A selection from outside the new flow would point at a dimmed box, so drop it.
    if (changed && index !== null && selected && !selected.startsWith('flow:') && !selected.startsWith('rule:') && !flows[index].ids.includes(selected)) selected = null;
    syncRail();
    if (changed) say(activeFlow === null ? 'Whole graph' : flows[activeFlow].label + ', ' + (flows[activeFlow].kind === 'steps' ? flows[activeFlow].stepLabels.length + ' steps' : flows[activeFlow].nodeCount + ' boxes'));
    if (activeFlow === null) {
      swapSource(source);
      applyFocus();
      if (selected?.startsWith('flow:')) show(null);
      return;
    }
    const f = flows[activeFlow];
    if (flowMode === 'solo') {
      swapSource(f.mermaid);
      applyFocus();
    } else {
      swapSource(source);
      applyFocus();
      if (stepIdx < 0) reveal(box.querySelectorAll('.pele-node.fm-in'));
    }
    if (stepIdx >= 0) gotoStep(stepIdx);
    else if (!selected || selected.startsWith('flow:')) show('flow:' + activeFlow);
  };

  const show = (key, extraLight) => {
    selected = key;
    detail.replaceChildren();
    document.querySelectorAll('.rules li.sel').forEach((li) => li.classList.remove('sel'));
    document.querySelectorAll('button[data-select]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.select === key)));
    const rule = key?.startsWith('rule:') ? rules[Number(key.slice(5))] : null;
    const flowItem = key?.startsWith('flow:') ? flows[Number(key.slice(5))] : null;
    const c = key && claims[key];
    if (rule) {
      if (activeFlow !== null && flowMode === 'solo') {
        activeFlow = null;
        stepIdx = -1;
        syncRail();
        swapSource(source);
        applyFocus();
      }
      light(rule.ids);
      const tone = rule.ok ? 'ok' : (rule.vacuous || rule.uncertain) ? 'guess' : 'bad';
      lead('Rule', rule.ok ? 'Holds' : rule.vacuous ? 'Cannot check' : rule.uncertain ? 'May break' : 'Broken', tone, tone);
      detail.append(text('strong', '', rule.says));
      group(rule.ok ? 'Why it holds' : rule.vacuous ? 'Why it cannot be checked' : 'Why it breaks').append(text('p', 'd-note' + (rule.ok ? '' : rule.vacuous || rule.uncertain ? ' guess' : ' bad'), rule.detail));
      document.querySelector('[data-select="' + CSS.escape(key) + '"]')?.closest('li')?.classList.add('sel');
    } else if (flowItem) {
      // The rail shows the flow itself; the panel waits for a box, arrow or step.
      light([]);
      detail.className = 'detail';
      detail.innerHTML = emptyDetail;
    } else if (c) {
      light(extraLight ?? [key]);
      lead(c.kind === 'box' ? 'Box' : 'Arrow', c.sources ? 'Sourced' : 'Guess', c.sources ? 'ok' : 'warn', c.sources ? '' : 'guess');
      // Title: a box's label; an arrow's own label, or where it goes when it has none.
      detail.append(text('strong', '', c.kind === 'arrow' ? (c.via || (claims[c.from]?.label ?? '') + ' → ' + (claims[c.to]?.label ?? '')) : c.label));
      if (c.kind === 'arrow') {
        const rows = group('Connects');
        for (const [role, id] of [['from', c.from], ['to', c.to]]) {
          if (claims[id]) rows.append(row({ lead: icon(role), title: claims[id].label, meta: role === 'from' ? 'From' : 'To', onClick: () => selectAndReveal(id) }));
        }
      }
      if (c.sources) {
        const rows = group(c.sources.length === 1 ? 'Source' : c.sources.length + ' sources');
        for (const s of c.sources) rows.append(sourceRow(s));
      } else {
        group('Source').append(text('p', 'd-note guess', 'None yet, so it is drawn dashed. Confirm it, or find a line that says it.'));
      }
      const belongs = flowsOf[key];
      if (belongs?.length) {
        const rows = group('In flows');
        for (const fi of belongs) {
          const f = flows[fi];
          const at = f.kind === 'steps' ? f.stepNodeIds.indexOf(key) : -1;
          const go = () => { if (activeFlow !== fi) setFlow(fi); if (at >= 0) gotoStep(at); else show(key); };
          rows.append(row({ lead: text('kbd', 'fkey', fi < 9 ? String(fi + 1) : '·'), title: f.label, meta: at >= 0 ? 'Step ' + (at + 1) + ' of ' + f.stepNodeIds.length : '', onClick: go, current: fi === activeFlow }));
        }
      }
    } else {
      light([]);
      detail.className = 'detail';
      detail.innerHTML = emptyDetail;
    }
    rail?.querySelectorAll('[data-box]').forEach((b) => b.classList.toggle('sel', b.dataset.box === key));
  };

  box.addEventListener('click', (event) => {
    const el = event.target.closest('.pele-node[data-id], .pele-edge[data-id]');
    if (!el) {
      // A click on empty board drops the selection, back to the active flow if there is one.
      if (selected && !selected.startsWith('flow:')) show(activeFlow !== null ? 'flow:' + activeFlow : null);
      return;
    }
    const soloMap = activeFlow !== null && flowMode === 'solo' ? flows[activeFlow].soloMap : null;
    const claimId = soloMap?.[el.dataset.id] ?? el.dataset.id;
    if (claims[claimId]) {
      if (activeFlow !== null && flows[activeFlow].kind === 'steps') {
        const pos = flows[activeFlow].stepNodeIds.indexOf(claimId);
        if (pos >= 0) { stepIdx = pos; syncRail(); }
      }
      show(claimId === selected ? (activeFlow !== null ? 'flow:' + activeFlow : null) : claimId);
      if (selected && !selected.startsWith('flow:')) setOpen(true);
    }
  });

  document.querySelectorAll('[data-flow]').forEach((b) => b.addEventListener('click', () => {
    preview = null;
    setFlow(b.dataset.flow === '' ? null : Number(b.dataset.flow));
  }));
  document.querySelectorAll('[data-flow-step]').forEach((b) => b.addEventListener('click', () => {
    if (activeFlow === null) return;
    const n = flows.length;
    setFlow((activeFlow + Number(b.dataset.flowStep) + n) % n);
  }));
  // Hover or focus a card to preview its flow on the board.
  document.querySelectorAll('.fcard').forEach((c) => {
    const on = () => { if (activeFlow !== null) return; preview = Number(c.dataset.flow); c.classList.add('peek'); applyFocus(); };
    const off = () => { c.classList.remove('peek'); if (preview !== Number(c.dataset.flow)) return; preview = null; if (activeFlow === null) applyFocus(); };
    c.addEventListener('pointerenter', on);
    c.addEventListener('pointerleave', off);
    c.addEventListener('focus', on);
    c.addEventListener('blur', off);
  });
  // Many flows get a filter box.
  const filter = document.getElementById('rail-filter');
  filter?.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('.fcard').forEach((c) => {
      const hit = !q || c.textContent.toLowerCase().includes(q);
      c.parentElement.hidden = !hit;
      shown += hit;
    });
    document.getElementById('rail-empty').hidden = shown > 0;
  });
  document.querySelectorAll('[data-fmode]').forEach((b) => b.addEventListener('click', () => {
    if (activeFlow !== null) setFlow(activeFlow, b.dataset.fmode);
  }));
  // Step controls and step lists in the rail. Picking a step of another flow opens that flow first.
  document.querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', () => gotoStep(stepIdx - 1)));
  document.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => gotoStep(stepIdx < 0 ? 0 : stepIdx + 1)));
  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const [fi, si] = b.dataset.step.split(':').map(Number);
    if (activeFlow !== fi) setFlow(fi);
    gotoStep(si);
  }));
  document.querySelectorAll('[data-box]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.box;
    show(id === selected ? 'flow:' + activeFlow : id);
    if (selected === id) {
      const soloMap = flowMode === 'solo' && activeFlow !== null ? flows[activeFlow].soloMap : null;
      const domId = soloMap ? Object.keys(soloMap).find((k) => soloMap[k] === id) ?? id : id;
      const el = box.querySelector('[data-id="' + CSS.escape(domId) + '"]');
      if (el) reveal(el, { minK: READABLE, maxK: Math.max(cam.k, READABLE) });
    }
  }));

  // Keyboard shortcuts (ignored while typing or with modifier keys).
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (event.key === 'Escape') {
      if (selected && !selected.startsWith('flow:')) {
        stepIdx = -1;
        syncRail();
        show(activeFlow !== null ? 'flow:' + activeFlow : null);
      } else if (activeFlow !== null) setFlow(null);
      else if (selected) show(null);
      return;
    }
    if (event.key === '\\') { setOpen(!open); return; }
    if (rail && event.key === '[') { setRailOpen(!railOpen); return; }
    if (event.key === '?') {
      setOpen(true);
      const how = document.getElementById('sec-how');
      how.open = true;
      const body = how.closest('.panel-body');
      body.scrollTo({ top: how.offsetTop - body.offsetTop - 8, behavior: 'smooth' });
      return;
    }
    if (event.key === '+' || event.key === '=') { zoomStep(1.25); return; }
    if (event.key === '-' || event.key === '_') { zoomStep(0.8); return; }
    if (flows.length && event.key === '0') { setFlow(null); return; }
    if (flows.length && /^[1-9]$/.test(event.key)) {
      const idx = Number(event.key) - 1;
      if (idx < flows.length) setFlow(idx === activeFlow ? null : idx);
      return;
    }
    if (activeFlow !== null && (event.key === 's' || event.key === 'S')) {
      setFlow(activeFlow, flowMode === 'solo' ? 'highlight' : 'solo');
      return;
    }
    if (activeFlow !== null && flows[activeFlow].kind === 'steps') {
      if (event.key === 'ArrowRight') { event.preventDefault(); gotoStep(stepIdx < 0 ? 0 : stepIdx + 1); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); if (stepIdx > 0) gotoStep(stepIdx - 1); return; }
    }
    if (event.key === 'f' || event.key === 'F') { fitAll(); return; }
    // Arrow keys pan the board, unless focus is in the panel (where they scroll or resize it).
    const pan = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (pan && !event.target?.closest?.('.panel, .rail')) {
      event.preventDefault();
      const d = event.shiftKey ? 320 : 96;
      animateTo({ k: cam.k, x: cam.x + pan[0] * d, y: cam.y + pan[1] * d }, 160);
    }
  });

  // A big graph scrolls, so bring the first lit box or arrow into view, not just the canvas.
  document.querySelectorAll('button[data-select]').forEach((b) => b.addEventListener('click', () => {
    show(b.dataset.select === selected ? null : b.dataset.select);
    reveal(box.querySelectorAll('.fm-on'));
  }));
  // The panel: open or closed, and how wide. Both are remembered in this browser when it allows.
  const store = {
    get: (k) => { try { return localStorage.getItem('flowmap:' + k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem('flowmap:' + k, v); } catch { /* not kept */ } },
  };
  const MIN = 300, DEFAULT = 384;
  const handle = document.getElementById('fm-resize');
  const openBtn = document.getElementById('fm-open');
  const closeBtn = document.getElementById('fm-close');
  const maxWidth = () => Math.max(MIN, Math.round(innerWidth * 0.7));
  let width = Number(store.get('side')) || DEFAULT;
  const setWidth = (w, save = true) => {
    width = Math.min(maxWidth(), Math.max(MIN, Math.round(w)));
    main.style.setProperty('--side', width + 'px');
    handle.setAttribute('aria-valuemin', MIN);
    handle.setAttribute('aria-valuemax', maxWidth());
    handle.setAttribute('aria-valuenow', width);
    if (save) store.set('side', width);
  };
  let open = true;
  const setOpen = (value) => {
    if (open === value) return;
    open = value;
    main.classList.toggle('fm-closed', !open);
    openBtn.setAttribute('aria-expanded', String(open));
    closeBtn.setAttribute('aria-expanded', String(open));
    store.set('open', open ? '1' : '0');
    (open ? closeBtn : openBtn).focus({ preventScroll: true });
  };
  setWidth(width, false);
  if (store.get('open') === '0') { open = false; main.classList.add('fm-closed'); openBtn.setAttribute('aria-expanded', 'false'); closeBtn.setAttribute('aria-expanded', 'false'); }
  closeBtn.addEventListener('click', () => setOpen(false));

  // The flows rail: open or closed, remembered like the panel.
  let railOpen = true;
  const railOpenBtn = document.getElementById('rail-open');
  const railCloseBtn = document.getElementById('rail-close');
  const setRailOpen = (value, focus = true) => {
    if (!rail || railOpen === value) return;
    railOpen = value;
    main.classList.toggle('fm-rail-closed', !railOpen);
    railOpenBtn.setAttribute('aria-expanded', String(railOpen));
    railCloseBtn.setAttribute('aria-expanded', String(railOpen));
    store.set('rail', railOpen ? '1' : '0');
    if (focus) (railOpen ? railCloseBtn : railOpenBtn).focus({ preventScroll: true });
  };
  if (rail) {
    if (store.get('rail') === '0') setRailOpen(false, false);
    railCloseBtn.addEventListener('click', () => setRailOpen(false));
    railOpenBtn.addEventListener('click', () => setRailOpen(true));
  }
  openBtn.addEventListener('click', () => setOpen(true));
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    main.classList.add('fm-dragging');
    const right = main.getBoundingClientRect().right;
    const move = (e) => setWidth(right - e.clientX, false);
    const up = () => {
      main.classList.remove('fm-dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      store.set('side', width);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', () => setWidth(DEFAULT));
  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 64 : 16;
    const to = { ArrowLeft: width + step, ArrowRight: width - step, Home: maxWidth(), End: MIN }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    setWidth(to);
  });
  addEventListener('resize', () => setWidth(width, false));

  // The board camera. The SVG keeps its natural size; cam places it: screen = graph * k + (x, y).
  // One model for every input: drag, wheel, pinch, keys, buttons, minimap and "reveal".
  const cam = { x: 0, y: 0, k: 1 };
  const MIN_K = 0.1, MAX_K = 4, READABLE = config.readable;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const zoomLevel = document.getElementById('z-level');
  const zoomIn = document.getElementById('z-in');
  const zoomOut = document.getElementById('z-out');
  const mini = document.getElementById('minimap');
  const miniArt = document.getElementById('mm-art');
  const miniView = document.getElementById('mm-view');
  let svgEl = null, natW = 0, natH = 0, miniSvg = null, miniK = 1;
  let viewedSource = null; // the source the camera was framed for
  let touched = false;     // the reader moved the camera, so resizes keep their view
  let anim = 0;
  let lastW = 0, lastH = 0;

  // Room the floating controls take on each side of the board.
  const pad = () => {
    const narrow = box.clientWidth < 600;
    return { top: 64, bottom: 64, left: narrow ? 16 : 40, right: narrow ? 16 : 40 };
  };
  const clampK = (k) => Math.min(MAX_K, Math.max(MIN_K, k));
  // Keep at least a strip of the graph on screen so it can never be lost off the edge.
  const clampCam = (c) => {
    const keep = 80, w = natW * c.k, h = natH * c.k, vw = box.clientWidth, vh = box.clientHeight;
    c.x = Math.min(vw - Math.min(keep, w), Math.max(Math.min(keep, w) - w, c.x));
    c.y = Math.min(vh - Math.min(keep, h), Math.max(Math.min(keep, h) - h, c.y));
    return c;
  };
  // The camera that shows graph rect g whole, centered, at no more than maxK.
  const frame = (g, maxK = 1) => {
    const p = pad(), aw = Math.max(40, box.clientWidth - p.left - p.right), ah = Math.max(40, box.clientHeight - p.top - p.bottom);
    const k = clampK(Math.min(maxK, aw / Math.max(1, g.w), ah / Math.max(1, g.h)));
    return { k, x: p.left + (aw - g.w * k) / 2 - g.x * k, y: p.top + (ah - g.h * k) / 2 - g.y * k };
  };
  const whole = () => ({ x: 0, y: 0, w: natW, h: natH });
  // First view: the whole graph if it is readable that way; else fill the width at a readable size, from the top.
  const startView = () => {
    const fitted = frame(whole());
    if (fitted.k >= READABLE || !natW) return fitted;
    const p = pad(), aw = box.clientWidth - p.left - p.right;
    const k = Math.min(1, Math.max(READABLE, aw / natW));
    return { k, x: natW * k <= aw ? p.left + (aw - natW * k) / 2 : p.left, y: p.top };
  };

  const apply = () => {
    if (!svgEl) return;
    svgEl.style.transform = 'translate(' + cam.x + 'px,' + cam.y + 'px) scale(' + cam.k + ')';
    zoomLevel.textContent = Math.round(cam.k * 100) + '%';
    zoomIn.disabled = cam.k >= MAX_K - 1e-3;
    zoomOut.disabled = cam.k <= MIN_K + 1e-3;
    drawMini();
  };
  const stop = () => { cancelAnimationFrame(anim); anim = 0; };
  const set = (c) => { stop(); Object.assign(cam, clampCam({ ...c })); apply(); };
  const animateTo = (target, ms = 300) => {
    stop();
    const to = clampCam({ ...target });
    if (reduceMotion.matches || !svgEl) { Object.assign(cam, to); apply(); return; }
    const from = { ...cam }, t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      cam.k = from.k * Math.pow(to.k / from.k, e);
      cam.x = from.x + (to.x - from.x) * e;
      cam.y = from.y + (to.y - from.y) * e;
      apply();
      anim = p < 1 ? requestAnimationFrame(tick) : 0;
    };
    anim = requestAnimationFrame(tick);
  };
  // The camera at zoom k that keeps the graph point under screen point (sx, sy) where it is.
  const zoomedAt = (k, sx, sy) => {
    const v = box.getBoundingClientRect(), nk = clampK(k);
    const gx = (sx - v.left - cam.x) / cam.k, gy = (sy - v.top - cam.y) / cam.k;
    return { k: nk, x: sx - v.left - gx * nk, y: sy - v.top - gy * nk };
  };
  const center = () => { const v = box.getBoundingClientRect(); return [v.left + v.width / 2, v.top + v.height / 2]; };
  const zoomStep = (f) => { touched = true; animateTo(zoomedAt(cam.k * f, ...center()), 220); };
  const fitAll = () => { touched = false; animateTo(frame(whole())); };

  // Take over a freshly rendered SVG. A new graph (Solo, or back to All) gets a fresh view.
  const attach = () => {
    const svg = box.querySelector(':scope > svg');
    if (!svg) return;
    box.classList.add('fm-cam');
    const fresh = svg !== svgEl;
    svgEl = svg;
    natW = Number(svg.getAttribute('width')) || svg.getBBox?.().width || 0;
    natH = Number(svg.getAttribute('height')) || svg.getBBox?.().height || 0;
    for (const [prop, val] of [['width', natW + 'px'], ['height', natH + 'px'], ['max-width', 'none'], ['max-height', 'none']]) {
      svg.style.setProperty(prop, val, 'important');
    }
    if (fresh || viewedSource !== mountedSource) buildMini();
    lastW = box.clientWidth; lastH = box.clientHeight;
    if (viewedSource !== mountedSource) {
      viewedSource = mountedSource;
      touched = false;
      set(startView());
    } else apply();
  };

  // The minimap: a small copy of the drawing with the visible part outlined. Shown only when part is off screen.
  // The minimap is as wide as the zoom dock under it, and the drawing fills that width at a readable
  // size. A drawing taller than the box scrolls inside it to follow the view; it holds still mid-drag.
  const MINI_H = 168;
  const dock = document.querySelector('.zoom-dock');
  let miniOY = 0, miniFullH = 0, miniDragging = false;
  const buildMini = () => {
    miniSvg?.remove();
    if (!svgEl || !natW || !natH) return;
    const innerW = Math.max(100, (dock?.offsetWidth || 154) - 14);
    miniK = innerW / natW;
    miniFullH = natH * miniK;
    miniSvg = svgEl.cloneNode(true);
    miniSvg.removeAttribute('id');
    miniSvg.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    miniSvg.removeAttribute('aria-roledescription');
    miniSvg.removeAttribute('role');
    miniArt.style.width = Math.round(innerW) + 'px';
    miniArt.style.height = Math.round(Math.min(MINI_H, miniFullH)) + 'px';
    miniArt.prepend(miniSvg);
    miniOY = 0;
  };
  const drawMini = () => {
    if (!miniSvg) return;
    const vw = box.clientWidth, vh = box.clientHeight;
    const x0 = -cam.x / cam.k, y0 = -cam.y / cam.k, x1 = x0 + vw / cam.k, y1 = y0 + vh / cam.k;
    const all = x0 <= 1 && y0 <= 1 && x1 >= natW - 1 && y1 >= natH - 1;
    mini.classList.toggle('off', all);
    const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(natW, x1), cy1 = Math.min(natH, y1);
    const artH = Math.min(MINI_H, miniFullH);
    if (!miniDragging) {
      // Keep the outlined part centered in the box, within the drawing's ends.
      const mid = ((cy0 + cy1) / 2) * miniK;
      miniOY = Math.max(0, Math.min(miniFullH - artH, mid - artH / 2));
    }
    // Set properties one by one: the inline style also holds Pele's color variables.
    miniSvg.style.setProperty('transform', 'translate(0px,' + (-miniOY) + 'px) scale(' + miniK + ')');
    mini.classList.toggle('mm-top', miniOY > 0.5);
    mini.classList.toggle('mm-bottom', miniOY < miniFullH - artH - 0.5);
    Object.assign(miniView.style, {
      left: cx0 * miniK + 'px', top: (cy0 * miniK - miniOY) + 'px',
      width: Math.max(4, (cx1 - cx0) * miniK) + 'px', height: Math.max(4, (cy1 - cy0) * miniK) + 'px',
    });
  };
  const miniGo = (e, smooth) => {
    const a = miniArt.getBoundingClientRect();
    const gx = (e.clientX - a.left) / miniK, gy = (e.clientY - a.top + miniOY) / miniK;
    const to = { k: cam.k, x: box.clientWidth / 2 - gx * cam.k, y: box.clientHeight / 2 - gy * cam.k };
    touched = true;
    smooth ? animateTo(to, 200) : set(to);
  };
  mini.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    mini.setPointerCapture(e.pointerId);
    miniGo(e, true);
    miniDragging = true;
    const move = (ev) => miniGo(ev, false);
    const up = () => { miniDragging = false; drawMini(); mini.removeEventListener('pointermove', move); mini.removeEventListener('pointerup', up); mini.removeEventListener('pointercancel', up); };
    mini.addEventListener('pointermove', move);
    mini.addEventListener('pointerup', up);
    mini.addEventListener('pointercancel', up);
  });

  // Drag to pan (anywhere: a press that does not move is still a click), two fingers to pinch.
  const pointers = new Map();
  let drag = null, pinch = null, swallowClick = false;
  box.addEventListener('pointerdown', (e) => {
    if (!svgEl || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1)) return;
    if (e.button === 1) e.preventDefault();
    swallowClick = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: e.button === 1 };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, v = box.getBoundingClientRect();
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: cam.k, gx: (mx - v.left - cam.x) / cam.k, gy: (my - v.top - cam.y) / cam.k };
      for (const id of pointers.keys()) box.setPointerCapture?.(id);
    }
  });
  box.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, v = box.getBoundingClientRect();
      const k = clampK(pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
      touched = true; swallowClick = true;
      set({ k, x: mx - v.left - pinch.gx * k, y: my - v.top - pinch.gy * k });
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved || !box.classList.contains('fm-panning')) {
      drag.moved = true;
      box.setPointerCapture?.(e.pointerId);
      box.classList.add('fm-panning');
    }
    touched = true; swallowClick = true;
    set({ k: cam.k, x: drag.cx + dx, y: drag.cy + dy });
  });
  const release = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    pinch = null;
    if (pointers.size === 1) {
      const [p] = pointers.values();
      drag = { x: p.x, y: p.y, cx: cam.x, cy: cam.y, moved: true };
    } else if (!pointers.size) {
      drag = null;
      box.classList.remove('fm-panning');
    }
  };
  box.addEventListener('pointerup', release);
  box.addEventListener('pointercancel', release);
  // A drag ends in a click on whatever is under the pointer; that click is not a selection.
  box.addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  // Wheel and trackpad: scroll pans, pinch (ctrl + wheel) or ⌘/Ctrl + scroll zooms at the pointer.
  box.addEventListener('wheel', (e) => {
    if (!svgEl) return;
    e.preventDefault();
    touched = true;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.clientHeight : 1;
    let dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      set(zoomedAt(cam.k * Math.exp(-Math.max(-60, Math.min(60, dy)) * 0.01), e.clientX, e.clientY));
      return;
    }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    set({ k: cam.k, x: cam.x - dx, y: cam.y - dy });
  }, { passive: false });
  // Safari reports trackpad pinches as gesture events.
  let gestureK = 0;
  box.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureK = cam.k; });
  box.addEventListener('gesturechange', (e) => { e.preventDefault(); touched = true; set(zoomedAt(gestureK * e.scale, e.clientX, e.clientY)); });
  box.addEventListener('gestureend', (e) => e.preventDefault());
  // Double-click on empty board fits the whole graph.
  box.addEventListener('dblclick', (e) => {
    if (e.target.closest('.pele-node, .pele-edge, .pele-edge-label')) return;
    e.preventDefault();
    fitAll();
  });

  // Keep the view steady when the board changes size (panel opened, closed, resized, or the window).
  new ResizeObserver(() => {
    if (!svgEl) return;
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    if (!touched) set(startView());
    else set({ k: cam.k, x: cam.x + (w - lastW) / 2, y: cam.y + (h - lastH) / 2 });
    lastW = w; lastH = h;
  }).observe(box);

  const fit = document.getElementById('fm-fit');
  fit.addEventListener('click', fitAll);
  zoomIn.addEventListener('click', () => zoomStep(1.25));
  zoomOut.addEventListener('click', () => zoomStep(0.8));
  zoomLevel.addEventListener('click', () => { touched = true; animateTo(zoomedAt(1, ...center()), 220); });

  try {
    mounted = pele.mount(box, source, {
      ...config.limits,
      zoom: false,
      onRender: () => {
        attach();
        applyFocus();
        if (activeFlow !== null && stepIdx >= 0) {
          const f = flows[activeFlow];
          const nid = f.stepNodeIds[stepIdx];
          const eid = stepIdx > 0 ? f.stepEdgeIds[stepIdx - 1] : null;
          light(eid ? [nid, eid] : [nid]);
        } else if (selected) show(selected);
      },
    });
  } catch (error) {
    box.after(text('p', 'error', 'The interactive view failed, so this is the static drawing. ' + (error && error.message || error)));
  }
  attach();
})();
