// Pixel-art menu screens: the kiosk and the mission map. They are DOM elements on a 384x216 "stage"
// that is scaled by the same integer pixel zoom as the game canvas, so the art stays crisp and lines up
// with the artist's layout (assets/art/manifest.json: kiosk_bg.layout, map_bg.nodes / pathDots / buttons).
// Buttons grow invisibly to at least 64 CSS px so they stay easy to hit with a thumb.
// Names (kiosk owner, neighbour) always come from the text data, never from here.
(function () {
  const A = {}; window.ART_MANIFEST.assets.forEach(a => { A[a.key] = a; });
  const UPG = window.GAME_DATA.upgrades.upgrades;
  const LEVELS = window.GAME_DATA.levels.levels;
  const t = (k, v) => I18N.t(k, v);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const url = key => `assets/art/${A[key].path}`;

  // ---------- sprite helpers ----------
  function framePos(key, frame) {
    const a = A[key], fw = a.frameWidth || a.imgW, fh = a.frameHeight || a.imgH, cols = Math.max(1, Math.floor(a.imgW / fw));
    return [-(frame % cols) * fw, -Math.floor(frame / cols) * fh];
  }
  // a sprite as an inline element; (x, y) = top-left in stage pixels
  function sp(key, frame, x, y, extra) {
    const a = A[key]; if (!a) return '';
    const fw = a.frameWidth || a.imgW, fh = a.frameHeight || a.imgH, [px, py] = framePos(key, frame || 0);
    const ex = extra || {};
    return `<i class="sp ${ex.cls || ''}" data-k="${key}"${ex.anim ? ` data-anim="${ex.anim}"` : ''}${ex.id ? ` id="${ex.id}"` : ''} style="left:${x}px;top:${y}px;width:${fw}px;height:${fh}px;background-image:url(${url(key)});background-size:${a.imgW}px ${a.imgH}px;background-position:${px}px ${py}px;${ex.style || ''}"></i>`;
  }
  function setFrame(el, frame) { const [px, py] = framePos(el.dataset.k, frame); el.style.backgroundPosition = `${px}px ${py}px`; }
  function nine(key, x, y, w, h, style) {
    const a = A[key], s = a.slices;
    return `<i class="nine" style="left:${x}px;top:${y}px;width:${w - s.leftWidth - s.rightWidth}px;height:${h - s.topHeight - s.bottomHeight}px;border-style:solid;border-width:${s.topHeight}px ${s.rightWidth}px ${s.bottomHeight}px ${s.leftWidth}px;border-image:url(${url(key)}) ${s.topHeight} ${s.rightWidth} ${s.bottomHeight} ${s.leftWidth} fill;${style || ''}"></i>`;
  }
  // a button centred on the art rectangle (x, y, w, h); its hit area is at least 64 CSS px
  function btn(attrs, x, y, w, h, inner, label) {
    return `<button class="pb" ${attrs} aria-label="${esc(label || '')}" style="left:${x + w / 2}px;top:${y + h / 2}px;--w:${w}px;--h:${h}px">${inner}</button>`;
  }
  function thumb(name, state, x, y, attrs, label) {
    const f = A.ui_thumb_buttons.frames[name];
    return btn(`${attrs} data-thumb="${name}"`, x, y, 32, 32, sp('ui_thumb_buttons', f[state || 'normal'], 0, 0, { cls: 'c' }), label);
  }
  function bank(n) {
    return `<div class="pbank" style="left:170px;top:1px">${sp('ui_pfand_icon', 0, 4, 1)}<span>${String(n).padStart(3, '0')}</span></div>`;
  }

  // ---------- animation ticker (manifest animations, played on DOM sprites) ----------
  const ANIMS = {};
  window.ART_MANIFEST.assets.forEach(a => (a.animations || []).forEach(an => { ANIMS[an.key] = Object.assign({ sheet: a.key }, an); }));
  function play(el, key, then) { if (!el) return; el.dataset.anim = key; el.dataset.t0 = performance.now(); if (then) el.dataset.then = then; else delete el.dataset.then; }
  function tick(now) {
    document.querySelectorAll('#screens [data-anim]').forEach(el => {
      const an = ANIMS[el.dataset.anim]; if (!an) return;
      if (el.dataset.until && now > +el.dataset.until) { delete el.dataset.anim; setFrame(el, +el.dataset.hold || 0); return; }
      const t0 = +el.dataset.t0 || (el.dataset.t0 = now);
      const per = 1000 / an.frameRate, n = an.frames.length;
      let i = Math.floor((now - t0) / per);
      if (an.repeat === -1) i %= n; else if (i >= n) { i = n - 1; if (el.dataset.then) { play(el, el.dataset.then); return; } }
      setFrame(el, an.frames[i]);
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // shrink a text box's font until it fits its width (used for the price tag text)
  function fit(root) {
    root.querySelectorAll('[data-fit]').forEach(el => {
      let fs = parseFloat(getComputedStyle(el).fontSize); const max = +el.dataset.fit;
      while (el.scrollWidth > max && fs > 4) { fs -= 0.5; el.style.fontSize = fs + 'px'; }
    });
  }

  // ---------- the stage ----------
  function zoom() { const g = window.__GAME; return (g && g.scale && g.scale.zoom) || 1; }
  function layout() {
    const z = zoom();
    document.querySelectorAll('.pstage').forEach(s => { s.style.transform = `translate(-50%, -50%) scale(${z})`; s.style.setProperty('--hit', (64.5 / z) + 'px'); });
  }
  function stage(cls, html, fill) {
    const screens = document.getElementById('screens');
    screens.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen pscreen ' + cls; wrap.style.background = fill;
    wrap.innerHTML = `<div class="pstage">${html}</div>`;
    screens.appendChild(wrap);
    layout(); fit(wrap);
    return wrap;
  }
  function onTap(root, sel, fn) {
    root.querySelectorAll(sel).forEach(el => {
      el.addEventListener('pointerdown', () => { el.classList.add('down'); const th = el.dataset.thumb; if (th && !el.disabled) setFrame(el.querySelector('.sp'), A.ui_thumb_buttons.frames[th].pressed); });
      const up = () => { el.classList.remove('down'); const th = el.dataset.thumb; if (th) setFrame(el.querySelector('.sp'), A.ui_thumb_buttons.frames[th][el.dataset.state || 'normal']); };
      el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up);
      el.addEventListener('click', e => { e.stopPropagation(); fn(el, e); });
    });
  }

  // =====================================================================================
  // Kiosk
  // =====================================================================================
  const K = { sel: null, page: 0 };
  // an upgrade's icon: arc-2 items live on ui_upgrade_icons2
  function upIcon(id, i, x, y, o) {
    for (const k of ['ui_upgrade_icons2', 'ui_upgrade_icons3']) if (A.ui_upgrade_icons.frames[id] === undefined && A[k] && A[k].frames[id] !== undefined) return sp(k, A[k].frames[id], x, y, o);
    return sp('ui_upgrade_icons', A.ui_upgrade_icons.frames[id] !== undefined ? A.ui_upgrade_icons.frames[id] : i, x, y, o);
  }
  function boonIcon(id, x, y, o) {
    for (const k of ['ui_boon_icons2', 'ui_boon_icons3']) if (A.ui_boon_icons.frames[id] === undefined && A[k] && A[k].frames[id] !== undefined) return sp(k, A[k].frames[id], x, y, o);
    return sp('ui_boon_icons', A.ui_boon_icons.frames[id] || 0, x, y, o);
  }
  function kiosk(say) {
    const S = SAVE.data, L = A.kiosk_bg.layout, owner = I18N.owner();
    const levelOf = u => S.upgrades[u.id] || 0;
    const [ox, oy] = L.slots_origin, [dx, dy] = L.slot_step, cols = L.slot_cols, per = cols * 2;
    // pages by arc: 'Fluss-Kram' opens with arc 2, 'Flug-Kram' with arc 3
    const EC = window.MH.economy, layout = EC.kioskLayout(UPG, S.unlocked, per), pages = layout.length;
    const visible = i => EC.pageOf(layout, i) >= 0;
    if (K.sel === null || !UPG[K.sel] || !visible(K.sel)) { K.sel = EC.defaultSel(UPG, S.upgrades, layout); }
    K.page = Math.max(0, EC.pageOf(layout, K.sel));
    const nextPage = (K.page + 1) % pages, pageLbl = (nextPage ? '' : '◀ ') + t('ui_kiosk_page' + (nextPage + 1)) + (nextPage ? ' ▶' : '');
    const slots = UPG.map((u, i) => {
      if (EC.pageOf(layout, i) !== K.page) return '';
      const j = layout[K.page].indexOf(i);
      const lv = levelOf(u), nxt = u.levels[lv], maxed = !nxt, short = nxt && S.bank < nxt.price;
      const state = EC.slotState(u, i, S, K.sel);
      const x = ox + (j % cols) * dx, y = oy + Math.floor(j / cols) * dy;
      const pips = u.levels.map((_, k) => sp('kiosk_pips', k < lv ? 1 : k === lv ? 2 : 0, 20 - (u.levels.length * 7 - 1) / 2 + k * 7, 23)).join('');
      const tag = maxed ? 'sold_out' : short ? 'short' : 'ok';
      const tagText = maxed ? t('kiosk_sold_out') : nxt.price;
      const badge = maxed ? sp('ui_badges', 1, 30, -4) : short ? sp('ui_badges', 0, 30, -4) : '';
      const inner = sp('kiosk_slot', A.kiosk_slot.frames[state], 0, 0)
        + upIcon(u.id, i, 12, 5, { style: state === 'locked' ? 'opacity:.5' : '' })
        + pips + sp('kiosk_price_tag', A.kiosk_price_tag.frames[tag], 2, 35)
        + `<span class="ptxt silk ${tag}" data-fit="${maxed ? 32 : 22}" style="left:${maxed ? 4 : 14}px;top:37px;width:${maxed ? 32 : 22}px">${esc(tagText)}</span>`
        + badge + `<i class="kaching" id="kaching-${i}"></i>`;
      return btn(`data-u="${i}"`, x, y, 40, 48, `<span class="c" style="width:40px;height:48px">${inner}</span>`, t(u.name_key));
    }).join('');

    const u = UPG[K.sel], lv = levelOf(u), nxt = u.levels[lv], short = nxt && S.bank < nxt.price;
    const [px, py, pw, ph] = L.detail_panel, [bx, by] = L.buy_button;
    const detail = nine('panel_dialogue', px, py, pw, ph)
      + upIcon(u.id, K.sel, px + 8, py + 8)
      + `<span class="ptxt pix big" style="left:${px + 28}px;top:${py + 6}px;width:${pw - 34}px">${esc(t(u.name_key))}</span>`
      + `<span class="ptxt silk dim" style="left:${px + 28}px;top:${py + 20}px">${esc(t('kiosk_level', { N: lv + '/' + u.levels.length }))}</span>`
      + `<span class="ptxt pix desc" style="left:${px + 8}px;top:${py + 32}px;width:${pw - 16}px">${esc(t(u.desc_key))}</span>`
      + (nxt ? `<span class="ptxt silk price ${short ? 'short' : ''}" style="left:${px + 8}px;top:${by - 12}px;width:${pw - 16}px">${esc(t('kiosk_price', { N: nxt.price }))}</span>` : '')
      + btn(`data-a="buy" ${nxt ? '' : 'disabled'}`, bx, by, 64, 24,
        sp('kiosk_buy_button', nxt && !short ? 0 : 2, 0, 0, { cls: 'c' }) + `<span class="ptxt pix lbl" style="left:0;top:5px;width:64px">${esc(nxt ? t('kiosk_buy') : t('kiosk_sold_out'))}</span>`,
        nxt ? t('kiosk_buy') : t('kiosk_sold_out'));

    const [dlx, dly, dlw, dlh] = L.dialogue_panel, [pfx, pfy] = L.portrait_frame;
    const msgKey = say || 'kiosk_greet';
    const pFrame = { kiosk_bought: 2, kiosk_not_enough: 3 }[msgKey] || 0;
    const dialogue = nine('panel_dialogue', dlx, dly, dlw, dlh)
      + sp('ui_portrait_frame', 0, pfx, pfy) + sp('npc_yuppie_portrait', pFrame, pfx + 4, pfy + 4, { id: 'k-portrait', anim: 'yuppie_portrait_talk' })
      + `<span class="ptxt silk owner" style="left:${pfx + 42}px;top:${dly + 6}px">${esc(owner.toUpperCase())}</span>`
      + `<span class="ptxt pix say" style="left:${pfx + 42}px;top:${dly + 17}px;width:${dlx + dlw - pfx - 50}px">${esc(t(msgKey))}</span>`;

    const [kx, ky] = L.yuppie || L.kalle;
    const html = sp('kiosk_bg', 0, 0, 0)
      + sp('npc_yuppie', 0, kx - 16, ky - 48, { id: 'k-npc', anim: say === 'kiosk_bought' ? 'yuppie_cheer' : say === 'kiosk_not_enough' ? 'yuppie_shrug' : say ? 'yuppie_talk' : 'yuppie_wave' })
      + sp('kiosk_counter', 0, 0, L.counter_overlay_y)
      + sp('npc_wurst', 0, kx - 46, L.counter_overlay_y - 5, { id: 'k-dog', anim: say === 'kiosk_bought' ? 'wurst_happy' : 'wurst_sit' })
      + (say === 'kiosk_bought' ? `<span class="ptxt silk dogsay" id="k-dogsay" style="left:${kx - 50}px;top:${L.counter_overlay_y - 17}px">${esc(t('dog_buy'))}</span>` : '')
      + `<span class="ptxt pix title" style="left:${L.title[0]}px;top:${L.title[1]}px">${esc(t('kiosk_name'))}</span>` + bank(S.bank)
      + slots + detail + dialogue
      + (pages > 1 ? btn('data-a="kpage"', ox, oy + 2 * dy - 2, 2 * dx + 40, 14, `<span class="c" style="width:${2 * dx + 40}px;height:14px">${nine('panel_dialogue', 0, 0, 2 * dx + 40, 14)}<span class="ptxt silk lbl" style="left:0;top:3px;width:${2 * dx + 40}px">${esc(pageLbl)}</span></span>`, pageLbl) : '')
      + thumb('back', 'normal', L.leave_button[0], L.leave_button[1], 'data-a="leave"', t('kiosk_leave'));
    const d = stage('kiosk2', html, '#2a1c16');
    const npc = d.querySelector('#k-npc'), por = d.querySelector('#k-portrait');
    const settle = () => { if (npc.isConnected) play(npc, 'yuppie_idle'); if (por.isConnected) { delete por.dataset.anim; setFrame(por, pFrame); } };
    npc.dataset.then = 'yuppie_idle';
    setTimeout(settle, say ? 1400 : 1800);
    if (say === 'kiosk_bought') setTimeout(() => { const g = d.querySelector('#k-dog'), b = d.querySelector('#k-dogsay'); if (g && g.isConnected) play(g, 'wurst_sit'); if (b) b.remove(); }, 1500);

    onTap(d, '[data-u]', el => { const i = +el.dataset.u; if (i === K.sel) return; SFX.play('click'); K.sel = i; kiosk(); });
    onTap(d, '[data-a=kpage]', () => { SFX.play('click'); K.sel = layout[nextPage][0]; kiosk(); });
    onTap(d, '[data-a=leave]', () => { SFX.play('click'); K.sel = null; UI.map(); });
    onTap(d, '[data-a=buy]', () => {
      const r = EC.buy(S, UPG[K.sel]);
      if (r === 'maxed') return;
      if (r === 'short') { SFX.play('nope'); kiosk('kiosk_not_enough'); return; }
      SAVE.write(); SFX.play('buy');
      const i = K.sel; kiosk('kiosk_bought');
      const fx = document.getElementById('kaching-' + i);
      if (fx) { fx.outerHTML = sp('fx_kaching', 0, 12, 5, { id: 'kaching-' + i, anim: 'kaching' }); }
      setTimeout(() => { const e = document.getElementById('kaching-' + i); if (e) e.remove(); }, 600);
    });
    return d;
  }

  // =====================================================================================
  // Mission map
  // =====================================================================================
  const M = { sel: null, page: 0 };
  // page 1 = the village (missions 1-5), page 2 = 'Ab nach Soest' (6-10, once mission 5 is beaten)
  function map() {
    const S = SAVE.data;
    const PG = window.MH.progress, unlocked = Math.min(LEVELS.length, S.unlocked);
    const prog = S.unlocked + '|' + S.cleared.filter(Boolean).length + '|' + ((window.GAMEFLOW && GAMEFLOW.winSeq) || 0);
    if (M.unl !== prog) { M.unl = prog; M.sel = null; }   // progress changed (new mission open / one cleared): jump to the first open one
    const mv = PG.mapView(S, LEVELS.length, A.map_bg_arc2, M.sel, A.map_bg_arc3), has2 = mv.has2, page = mv.page, n0 = mv.n0, n1 = mv.n1;
    M.sel = mv.sel;
    M.page = page;
    const sfx = page === 1 ? '' : '_arc' + page, bgKey = 'map_bg' + sfx, nkey = 'map_nodes' + sfx, bg = A[bgKey], nodes = bg.nodes, B = bg.buttons;
    const NF = A[nkey].frames;
    // path dots: lit when the mission at the end of the segment is unlocked
    let dots = '';
    for (const seg in bg.pathDots) {
      const lit = PG.dotLit(seg, unlocked);
      bg.pathDots[seg].forEach(([x, y]) => { dots += sp('map_path_dot', lit ? 1 : 0, x - 2, y - 2); });
    }
    let ns = '';
    for (let n = n0; n <= n1; n++) {
      const id = 'l' + n; if (!nodes[id] || !NF[id]) continue;
      const [cx, cy] = nodes[id], f = NF[id];
      const st = PG.nodeState(n, unlocked, S.cleared, M.sel), locked = st === 'locked', cur = st === 'current';
      const frame = f[{ locked: 'locked', current: 'current_a', cleared: 'cleared', open: 'open' }[st]];
      ns += btn(`data-l="${n}" data-state="${locked ? 'locked' : 'open'}" ${locked ? 'aria-disabled="true"' : ''}`, cx - 12, cy - 12, 24, 24,
        sp(nkey, frame, 0, 0, { cls: 'c', anim: cur && !locked ? `map_node_${id}_current` : '' }), locked ? t('ui_locked') : t(LEVELS[n - 1].title_key));
    }
    if (nodes.kiosk) { const [kx, ky] = nodes.kiosk; ns += btn('data-a="kiosk-node"', kx - 12, ky - 12, 24, 24, sp('map_nodes', A.map_nodes.frames.kiosk.open, 0, 0, { cls: 'c' }), t('kiosk_name')); }
    // arc switch
    const np = page % mv.pages + 1, pl = np === 1 ? '◀ ' + t('ui_arc1') : t('ui_arc' + np) + ' ▶', pw = 112;
    if (has2) ns += btn(`data-a="page"`, 192 - pw / 2, 182, pw, 24, `<span class="c" style="width:${pw}px;height:24px">${nine('panel_dialogue', 0, 0, pw, 24, np > page ? 'filter:hue-rotate(-20deg) saturate(1.6) brightness(1.15)' : '')}<span class="ptxt pix lbl" style="left:0;top:7px;width:${pw}px">${esc(pl)}</span></span>`, pl);
    // hero pin above the selected node + the name plate under it
    const [sx, sy] = nodes['l' + M.sel];
    const pin = sp('map_hero_marker', 0, sx - 8, sy - 10 - 21, { id: 'm-pin', anim: 'map_hero_bob' });
    const dog = sp('npc_wurst', 0, sx + 5, sy - 27, { id: 'm-dog', anim: 'wurst_sit' });
    const title = t(LEVELS[M.sel - 1].title_key);
    const label = `<div class="plabel" id="m-label" style="top:${sy + 14}px;--cx:${sx}px"><span class="ptxt pix ink">${esc(title)}</span></div>`;
    const html = sp(bgKey, 0, 0, 0) + dots + ns + dog + pin + label
      + `<span class="ptxt pix title" style="left:6px;top:4px">${esc(t('ui_missions'))}</span>` + bank(S.bank)
      + thumb('back', 'normal', B.back[0], B.back[1], 'data-a="back"', t('ui_back'))
      + thumb('kiosk', 'normal', B.kiosk[0], B.kiosk[1], 'data-a="kiosk"', t('ui_kiosk'))
      + thumb('play', 'normal', B.play[0], B.play[1], 'data-a="play"', t('ui_play'));
    const d = stage('map2', html, '#2d4a22');
    // keep the name plate inside the stage, using the map_label nine-slice behind the text
    const lab = d.querySelector('#m-label'), txt = lab.querySelector('span');
    const w = Math.ceil(txt.scrollWidth) + 2;
    let lx = Math.round(sx - w / 2); lx = Math.max(4, Math.min(384 - 4 - w, lx));
    lab.style.left = lx + 'px'; lab.style.width = w + 'px';
    lab.insertAdjacentHTML('afterbegin', nine('map_label', 0, 0, w, 14));
    if (sy + 14 + 14 > 176 && sx > 290) lab.style.top = (sy - 38) + 'px';

    onTap(d, '[data-l]', el => {
      const n = +el.dataset.l;
      if (n > unlocked) { SFX.play('nope'); el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 300); return; }
      SFX.play('click');
      if (n === M.sel) { UI.levelCard(n); return; }
      M.sel = n; map();
    });
    onTap(d, '[data-a=page]', () => {
      SFX.play('click');
      M.sel = PG.nextPageSel(S, unlocked, page, mv.pages);
      map();
    });
    onTap(d, '[data-a=kiosk], [data-a=kiosk-node]', () => { SFX.play('click'); UI.kiosk(); });
    onTap(d, '[data-a=back]', () => { SFX.play('click'); UI.title(); });
    onTap(d, '[data-a=play]', () => { SFX.play('click'); UI.levelCard(M.sel); });
    return d;
  }

  // =====================================================================================
  // Kiosk-Tuete (spec §8b): after the first clear of missions 1-4, three boon cards in the kiosk-slot
  // style. Tap a card to select it, tap it again (or Nehmen) to take it. The boon lasts for the next
  // mission only. Yuppie cheers; Wurst tilts his head while you choose, spins when you take, whines on skip.
  // =====================================================================================
  function tuete(n, offer, st) {
    st = st || { sel: -1, taken: -1, said: 'ui_tuete_pick' };
    const S = SAVE.data, L = A.kiosk_bg.layout, owner = I18N.owner();
    const [px, py, pw, ph] = [100, 22, 278, 116];
    const cx0 = px + pw / 2 - 84;
    const cards = offer.map((b, i) => {
      const state = st.taken >= 0 ? (i === st.taken ? 'owned' : 'locked') : i === st.sel ? 'selected' : 'available';
      const x = cx0 + i * 84 - 20, y = py + 8;
      const inner = sp('kiosk_slot', A.kiosk_slot.frames[state], 0, 0)
        + boonIcon(b.id, 12, 12, { style: state === 'locked' ? 'opacity:.45' : '' })
        + (i === st.taken ? sp('ui_badges', A.ui_badges.frames.check, 30, -4) : '');
      return btn(`data-b="${i}" ${st.taken >= 0 ? 'disabled' : ''}`, x, y, 40, 48, `<span class="c" style="width:40px;height:48px">${inner}</span>`, t('boon_' + b.id + '_name'))
        + `<span class="ptxt silk tname ${i === st.sel || i === st.taken ? 'on' : ''}" style="left:${x - 18}px;top:${y + 51}px;width:76px">${esc(t('boon_' + b.id + '_name'))}</span>`;
    }).join('');
    const pick = st.taken >= 0 ? st.taken : st.sel;
    const desc = pick >= 0 ? `<span class="ptxt pix desc" style="left:${px + 10}px;top:${py + 86}px;width:${pw - 20}px">${esc(t('boon_' + offer[pick].id + '_desc'))}</span>` : '';
    const by = 141, canTake = st.sel >= 0 && st.taken < 0;
    const pbtn = (a, x, w, label, frame) => btn(`data-a="${a}"`, x, by, w, 24,
      `<span class="c" style="width:${w}px;height:24px">${nine('panel_dialogue', 0, 0, w, 24, frame === 'hot' ? 'filter:hue-rotate(-20deg) saturate(1.6) brightness(1.15)' : '')}<span class="ptxt pix lbl" style="left:0;top:7px;width:${w}px">${esc(label)}</span></span>`, label);
    const buttons = (st.taken < 0 ? btn(`data-a="take" ${canTake ? '' : 'disabled'}`, px + 6, by, 64, 24,
        sp('kiosk_buy_button', canTake ? 0 : 2, 0, 0, { cls: 'c' }) + `<span class="ptxt pix lbl" style="left:0;top:5px;width:64px">${esc(t('ui_tuete_take'))}</span>`, t('ui_tuete_take')) : '')
      + pbtn('next', px + 80, 76, t('ui_next') + ' >', st.taken >= 0 ? 'hot' : '')
      + pbtn('kiosk', px + 164, 110, t('ui_to_kiosk'));
    const [dlx, dly, dlw, dlh] = L.dialogue_panel, [pfx, pfy] = L.portrait_frame;
    const dialogue = nine('panel_dialogue', dlx, dly, dlw, dlh)
      + sp('ui_portrait_frame', 0, pfx, pfy) + sp('npc_yuppie_portrait', st.taken >= 0 ? 2 : 0, pfx + 4, pfy + 4, { id: 't-portrait', anim: 'yuppie_portrait_talk' })
      + `<span class="ptxt silk owner" style="left:${pfx + 42}px;top:${dly + 6}px">${esc(owner.toUpperCase())}</span>`
      + `<span class="ptxt pix say" style="left:${pfx + 42}px;top:${dly + 17}px;width:${dlx + dlw - pfx - 50}px">${esc(t(st.said))}</span>`;
    const [kx, ky] = L.yuppie || L.kalle;
    const dogAnim = st.dog || (st.taken >= 0 ? 'wurst_happy' : 'wurst_tilt');
    const html = sp('kiosk_bg', 0, 0, 0)
      + sp('npc_yuppie', 0, kx - 16, ky - 48, { id: 't-npc', anim: st.taken >= 0 ? 'yuppie_cheer' : 'yuppie_wave' })
      + sp('kiosk_counter', 0, 0, L.counter_overlay_y)
      + sp('npc_wurst', 0, 4, 196 - 20, { id: 't-dog', anim: dogAnim })
      + `<span class="ptxt pix title" style="left:${L.title[0]}px;top:${L.title[1]}px">${esc(t('ui_tuete_title'))}</span>` + bank(S.bank)
      + nine('panel_dialogue', px, py, pw, ph) + cards + desc + buttons + dialogue;
    const d = stage('tuete', html, '#2a1c16');
    const npc = d.querySelector('#t-npc'), por = d.querySelector('#t-portrait'), dog = d.querySelector('#t-dog');
    npc.dataset.then = 'yuppie_idle';
    if (st.dog === 'wurst_spin') dog.dataset.then = 'wurst_happy';
    setTimeout(() => { if (por.isConnected) { delete por.dataset.anim; setFrame(por, st.taken >= 0 ? 2 : 0); } }, 1400);
    const take = i => {
      const b = offer[i]; if (!b) return;
      window.MH.economy.takeBoon(S, b.id); SAVE.write(); SFX.play('cheer'); setTimeout(() => SFX.play('wuff'), 250);
      tuete(n, offer, { sel: i, taken: i, said: 'ui_tuete_taken', dog: 'wurst_spin' });
    };
    let leaving = false;
    const leave = fn => {
      if (leaving) return; leaving = true;
      if (st.taken < 0) { SFX.play('whine'); play(dog, 'wurst_whine'); setTimeout(fn, 700); } else fn();
    };
    onTap(d, '[data-b]', el => {
      if (st.taken >= 0 || leaving) return;
      const i = +el.dataset.b;
      if (i === st.sel) { take(i); return; }
      SFX.play('rustle'); tuete(n, offer, { sel: i, taken: -1, said: 'ui_tuete_pick' });
    });
    onTap(d, '[data-a=take]', () => { if (st.sel >= 0 && st.taken < 0 && !leaving) take(st.sel); });
    onTap(d, '[data-a=next]', () => { SFX.play('click'); leave(() => GAMEFLOW.toMap()); });
    onTap(d, '[data-a=kiosk]', () => { SFX.play('click'); leave(() => { GAMEFLOW.toMap(); UI.kiosk(); }); });
    return d;
  }

  // a dialogue portrait (ui_portrait_frame + face) for the text cards, at the game's pixel zoom.
  // talkMs > 0 plays the talk animation for that long, then holds `frame`.
  function portrait(key, frame, talkMs) {
    const z = zoom(), a = A[key]; if (!a) return '';
    const talk = talkMs && a.animations && a.animations[0] ? a.animations[0].key : '';
    const face = sp(key, frame || 0, 4, 4, { anim: talk });
    const stop = talk ? face.replace('<i ', `<i data-until="${performance.now() + talkMs}" data-hold="${frame || 0}" `) : face;
    return `<span class="pport" style="width:${36 * z}px;height:${36 * z}px"><span class="pstage-mini" style="transform:scale(${z})">${sp('ui_portrait_frame', 0, 0, 0)}${stop}</span></span>`;
  }

  // Wurst on the text cards (win, note, ending), at the game's pixel zoom
  function dogSprite(anim, cls, mul) {
    const z = zoom() * (mul || 2);
    return `<span class="pdog ${cls || ''}" style="width:${24 * z}px;height:${20 * z}px"><span class="pstage-mini" style="width:24px;height:20px;transform:scale(${z})">${sp('npc_wurst', 0, 0, 0, { anim: anim || 'wurst_sit' })}</span></span>`;
  }

  // any art asset (frame or animation) on the text cards, at the game's pixel zoom
  function artSprite(key, frame, anim, mul) {
    const a = A[key]; if (!a) return '';
    const fw = a.frameWidth || a.imgW, fh = a.frameHeight || a.imgH, z = zoom() * (mul || 1);
    return `<span class="pdog" style="width:${fw * z}px;height:${fh * z}px"><span class="pstage-mini" style="width:${fw}px;height:${fh}px;transform:scale(${z})">${sp(key, frame || 0, 0, 0, { anim })}</span></span>`;
  }

  Object.assign(window.UI, { map, kiosk, tuete, portrait, dogSprite, artSprite, layoutStage: layout });
  window.addEventListener('resize', () => setTimeout(layout, 0));
})();
