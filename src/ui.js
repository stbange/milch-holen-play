// DOM menus, cards and HUD. Everything here is plain HTML on top of the canvas so text stays
// crisp and touch targets can be 64 CSS px regardless of the pixel-art zoom.
(function () {
  const $ = id => document.getElementById(id);
  const screens = $('screens');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const UPG = window.GAME_DATA.upgrades.upgrades;
  const LEVELS = window.GAME_DATA.levels.levels;

  function clear() { screens.innerHTML = ''; }
  function screen(html, cls) {
    clear();
    const d = document.createElement('div');
    d.className = 'screen ' + (cls || '');
    d.innerHTML = html;
    screens.appendChild(d);
    return d;
  }
  function on(root, sel, fn) { root.querySelectorAll(sel).forEach(el => el.addEventListener('click', e => { e.stopPropagation(); SFX.play('click'); fn(el, e); })); }
  // tap anywhere (after the minimum show time) to continue
  function tapAnywhere(root, fn, minS) {
    const t0 = performance.now(), min = (minS || 0) * 1000;
    let done = false;
    const go = e => { if (done || performance.now() - t0 < min) return; if (e && e.target.closest && e.target.closest('button')) return; done = true; SFX.play('click'); fn(); };
    root.addEventListener('pointerup', go);
    const key = e => { if (e.code === 'Space' || e.code === 'Enter') { if (!document.body.contains(root)) { window.removeEventListener('keydown', key); return; } window.removeEventListener('keydown', key); setTimeout(() => go(), 0); } };
    window.addEventListener('keydown', key);
  }
  const t = (k, v) => I18N.t(k, v);
  const bankHtml = () => `<div class="bank"><i></i><span>${SAVE.data.bank}</span></div>`;

  const UI = {
    clear,
    // ---------------- Title ----------------
    title() {
      const S = SAVE.data, started = S.unlocked > 1 || S.bank > 0;
      const d = screen(`
        <div class="corner"><button class="btn small" data-a="sound">${t(S.sound ? 'ui_sound_on' : 'ui_sound_off')}</button>
          <button class="btn small" data-a="lang">${S.lang === 'de' ? 'English' : 'Deutsch'}</button>${FS.button()}</div>
        <div class="title-wrap">
          <h1>${esc(t('ui_title'))}</h1>
          <p class="sub">${esc(t('ui_subtitle'))}</p>
          <div class="row"><button class="btn primary" data-a="play">${esc(t(started ? 'ui_continue' : 'ui_play'))}</button></div>
          <div class="row"><button class="btn small" data-a="credits">${esc(t('ui_credits'))}</button>
            ${started ? `<button class="btn small" data-a="reset">${esc(t('ui_reset_save'))}</button>` : ''}</div>
        </div>`);
      on(d, '[data-a=sound]', () => { S.sound = !S.sound; SFX.setEnabled(S.sound); SAVE.write(); UI.title(); });
      on(d, '[data-a=lang]', () => { S.lang = S.lang === 'de' ? 'en' : 'de'; I18N.setLang(S.lang); SAVE.write(); UI.title(); UI.refreshRotate(); });
      on(d, '[data-a=play]', () => { SFX.music('menu'); UI.map(); });
      on(d, '[data-a=credits]', () => UI.credits(() => UI.title()));
      on(d, '[data-a=reset]', () => UI.confirmReset());
      on(d, '[data-a=fs]', () => FS.toggle());
    },
    confirmReset() {
      const d = screen(`<div class="card"><p>${esc(t('ui_reset_confirm'))}</p><div class="row actions">
        <button class="btn primary" data-a="yes">${esc(t('ui_yes'))}</button><button class="btn" data-a="no">${esc(t('ui_no'))}</button></div></div>`, 'dim');
      on(d, '[data-a=yes]', () => { const lang = SAVE.data.lang; SAVE.reset(); SAVE.data.lang = lang; SAVE.write(); UI.title(); });
      on(d, '[data-a=no]', () => UI.title());
    },
    credits(back) {
      const d = screen(`<div class="card"><h2>${esc(t('ui_credits'))}</h2><p style="white-space:pre-line">${esc(t('credits'))}</p>
        <div class="row actions"><button class="btn" data-a="back">${esc(t('ui_back'))}</button></div></div>`, 'dim');
      on(d, '[data-a=back]', back);
    },
    // map() and kiosk() are the pixel-art screens in src/screens.js
    // ---------------- Pre-level: neighbour's note + mission goal ----------------
    levelCard(n) {
      const L = LEVELS[n - 1];
      if (n === 6 && !SAVE.data.hints.a2intro) { UI.a2Intro(() => { SAVE.data.hints.a2intro = true; SAVE.write(); UI.levelCard(6); }); return; }
      const d = screen(`<div class="card note">${UI.dogSprite('wurst_sit', 'note-dog')}<h2>${esc(t(L.title_key))}</h2><p>${esc(t(L.note_key))}</p>
        <div class="goal">➜ ${esc(t(L.goal_key))}</div><div class="tap">${esc(t('ui_tap_to_start'))} ▶</div></div>`, 'dim');
      tapAnywhere(d, () => { clear(); GAMEFLOW.startLevel(n); }, window.GAME_DATA.tuning.flow.card_min_show_s * 0.5);
    },
    // arc 2 opener (once): Yuppie is out of milk -> SUP down the Ahse
    a2Intro(onDone) {
      const d = screen(`<div class="card note a2intro">${UI.portrait('npc_yuppie_portrait', 0, 1600)}<h2>${esc(t('a2_intro_title'))}</h2><p>${esc(t('a2_intro_text'))}</p>
        <div class="pp-row">${UI.dogSprite('wurst_tilt')}<p class="dogline">${esc(t('a2_intro_dog'))}</p></div><div class="tap">${esc(t('ui_continue'))} ▶</div></div>`, 'dim');
      tapAnywhere(d, () => { clear(); onDone(); }, window.GAME_DATA.tuning.flow.card_min_show_s * 0.5);
    },
    // ---------------- In-level overlays ----------------
    pause(onResume, onRestart, onMap) {
      const S = SAVE.data;
      const d = screen(`<div class="card" style="text-align:center"><h2>${esc(t('ui_pause'))}</h2>
        <div class="row actions"><button class="btn primary" data-a="resume">${esc(t('ui_resume'))}</button>
        <button class="btn" data-a="restart">${esc(t('ui_restart'))}</button><button class="btn" data-a="map">${esc(t('ui_to_map'))}</button></div>
        <div class="row actions"><button class="btn small" data-a="sound">${esc(t(S.sound ? 'ui_sound_on' : 'ui_sound_off'))}</button>
        <button class="btn small" data-a="lang">${S.lang === 'de' ? 'English' : 'Deutsch'}</button>${FS.button()}</div></div>`, 'dim');
      on(d, '[data-a=resume]', () => { clear(); onResume(); });
      on(d, '[data-a=restart]', () => { clear(); onRestart(); });
      on(d, '[data-a=map]', () => { clear(); onMap(); });
      on(d, '[data-a=sound]', () => { S.sound = !S.sound; SFX.setEnabled(S.sound); SAVE.write(); UI.pause(onResume, onRestart, onMap); });
      on(d, '[data-a=lang]', () => { S.lang = S.lang === 'de' ? 'en' : 'de'; I18N.setLang(S.lang); SAVE.write(); UI.pause(onResume, onRestart, onMap); UI.refreshRotate(); });
      on(d, '[data-a=fs]', () => FS.toggle());
    },
    death(n, extraKey, onRestart, onMap) {
      const k = 'death_' + (1 + Math.floor(Math.random() * 3));
      const line = extraKey && Math.random() < 0.6 ? t(extraKey) : t(k);
      const d = screen(`<div class="card" style="text-align:center">${UI.portrait('hero_portrait', 0, 0)}<p style="font-size:22px">${esc(line)}</p>
        <div class="tap" style="text-align:center">${esc(t('death_restart'))}</div>
        <div class="row actions"><button class="btn small" data-a="map">${esc(t('ui_to_map'))}</button></div></div>`, 'dim');
      on(d, '[data-a=map]', () => { clear(); onMap(); });
      tapAnywhere(d, () => { clear(); onRestart(); }, window.GAME_DATA.tuning.flow.restart_input_lock_s);
    },
    // Level clear: results strip (Pfand, hits) + the clear bonus counting up (spec §8b), then
    // [Weiter] (Kiosk-Tuete on a first clear, else the map) and [Zu Yuppies Kiosk].
    win(n, bottles, unlockedNew, onNext, bonus, tuete) {
      const L = LEVELS[n - 1], B = bonus || { noHit: 0, collect: 0, total: 0, hits: 0 };
      const lines = [];
      if (B.noHit) lines.push(['ui_bonus_no_hit', B.noHit]);
      if (B.collect) lines.push(['ui_bonus_collect', B.collect]);
      const kioskBtn = n !== 5 && n !== 10 && !tuete ? `<button class="btn" data-a="kiosk">${esc(t('ui_to_kiosk'))}</button>` : '';
      const d = screen(`<div class="card wincard" style="text-align:center"><h2>${esc(t('ui_level_clear'))}</h2>
        <div class="pp-row">${UI.portrait('hero_portrait', 2, 1200)}${UI.dogSprite('wurst_happy')}</div>${n === 1 ? '<span class="milk"></span>' : ''}<p>${esc(t(L.card_after_key))}</p>
        <div class="results"><span>${esc(t('ui_result_pfand', { N: bottles }))}</span><span>${esc(t('ui_result_hits', { N: B.hits }))}</span></div>
        <div class="bonuses">${lines.map(([k], i) => `<span class="bonus" data-i="${i}">${esc(t(k, { N: 0 }))}</span>`).join('')}</div>
        <div class="foot"><p class="goal"><span id="win-banked">${esc(t('ui_bottles_banked', { N: bottles }))}</span> · ${bankHtml().replace('class="bank"', 'class="bank" style="display:inline-flex;color:var(--white)"')}</p>
        <div class="row actions"><button class="btn primary" data-a="next">${esc(t('ui_next'))} ▶</button>${kioskBtn}</div></div></div>`, 'dim');
      // count-up: each bonus ticks from 0 to its value, the banked total follows; the bank already holds it
      const bankEl = d.querySelector('.bank span'), banked = d.querySelector('#win-banked');
      const bank1 = SAVE.data.bank; let shown = bottles;
      if (bankEl) bankEl.textContent = bank1 - B.total;
      let li = 0, v = 0;
      const step = () => {
        if (!d.isConnected || li >= lines.length) { if (d.isConnected && lines.length) SFX.play('cheer'); return; }
        const [k, val] = lines[li], el = d.querySelector(`.bonus[data-i="${li}"]`);
        v++; shown++; el.textContent = t(k, { N: v }); el.classList.add('on');
        banked.textContent = t('ui_bottles_banked', { N: shown }); if (bankEl) bankEl.textContent = bank1 - B.total + (shown - bottles);
        SFX.play('tick');
        if (v >= val) { li++; v = 0; setTimeout(step, 260); } else setTimeout(step, 45);
      };
      setTimeout(step, 450);
      let done = false;
      const go = fn => { if (done) return; done = true; clear(); fn(); };
      on(d, '[data-a=next]', () => go(onNext));
      on(d, '[data-a=kiosk]', () => go(() => { GAMEFLOW.toMap(); UI.kiosk(); }));
      tapAnywhere(d, () => go(onNext), window.GAME_DATA.tuning.flow.card_min_show_s);
    },
    // one-time brake lesson: the left (brake) touch zone pulses once, the first time a Wolfi tells
    brakePulse() {
      let el = $('brake-pulse');
      if (!el) { el = document.createElement('div'); el.id = 'brake-pulse'; $('hud').appendChild(el); }
      el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
      clearTimeout(UI._bpT); UI._bpT = setTimeout(() => el.classList.remove('go'), 1300);
    },
    // Ending: one card per tap, in the designer's order (spec: ending_1, ending_2, ending_anton,
    // ending_dedication, ending_the_end). config.js endingMessage replaces the dedication if set.
    ending(onDone) {
      const cfg = window.MILCH_CONFIG || {};
      const own = cfg.endingMessage && String(cfg.endingMessage).trim();
      const from = cfg.endingFrom ? `<p>${esc(t('ui_from', { N: cfg.endingFrom }))}</p>` : '';
      const cards = [
        () => `${UI.portrait('hero_portrait', 2, 1500)}<span class="milk"></span><p>${esc(t('ending_1'))}</p>`,
        () => `<p>${esc(t('ending_2'))}</p>${UI.dogSprite('wurst_happy')}<p class="dogline">${esc(t('dog_ending'))}</p>`,
        () => `${UI.portrait('hero_portrait', 2, 0)}<p>${esc(t('ending_anton'))}</p>`,
        () => `<p class="ded">${esc(own ? own.replace(/\{HERO\}/g, I18N.hero()) : t('ending_dedication'))}</p>${from}`,
      ];
      const minS = window.GAME_DATA.tuning.flow.card_min_show_s;
      const show = i => {
        if (i < cards.length) {
          const d = screen(`<div class="ending">${cards[i]()}<div class="tap">${esc(t('ui_continue'))} ▶</div></div>`, 'dim');
          tapAnywhere(d, () => show(i + 1), minS);
          return;
        }
        const d = screen(`<div class="ending"><p class="big">${esc(t('ending_the_end'))}</p><p class="credits" style="white-space:pre-line">${esc(t('credits'))}</p>
          <div class="row"><button class="btn primary" data-a="map">${esc(t('ui_play_again'))}</button></div></div>`, 'dim');
        on(d, '[data-a=map]', onDone);
      };
      show(0);
    },
    // Arc-2 ending (after the Kirmes-Kuh): dusk trailer ride home, the kiosk queue, the singing cow,
    // the milk-with-a-candle card, then Mathi's dedication (or config.js endingMessage) and credits.
    ending2(onDone) {
      const cfg = window.MILCH_CONFIG || {};
      const own = cfg.endingMessage && String(cfg.endingMessage).trim();
      const from = cfg.endingFrom ? `<p>${esc(t('ui_from', { N: cfg.endingFrom }))}</p>` : '';
      const cards = [
        () => `<div class="dusk">${UI.artSprite('ending_trailer', 0, '', 2)}</div><p>${esc(t('ending2_1'))}</p>`,
        () => `<div class="pp-row">${UI.portrait('npc_yuppie_portrait', 2, 1400)}${UI.dogSprite('wurst_happy')}</div><p>${esc(t('ending2_2'))}</p>`,
        () => `${UI.artSprite('boss_kuh', 0, 'kuh_idle', 1)}<p class="dogline notes">♪ ♫ ♪</p><p>${esc(t('ending2_3'))}</p>`,
        () => `${UI.artSprite('ending_milk_candle', 0, '', 2)}<p class="big a2card">${esc(t('ending2_card'))}</p>`,
        () => `<p class="ded">${esc(own ? own.replace(/\{HERO\}/g, I18N.hero()) : t('ending_dedication'))}</p>${from}`,
      ];
      const minS = window.GAME_DATA.tuning.flow.card_min_show_s;
      const show = i => {
        if (i === 2) SFX.play('moo');
        if (i === 3) SFX.play('cheer');
        if (i < cards.length) {
          const d = screen(`<div class="ending e2c${i}">${cards[i]()}<div class="tap">${esc(t('ui_continue'))} ▶</div></div>`, 'dim');
          tapAnywhere(d, () => show(i + 1), minS);
          return;
        }
        const d = screen(`<div class="ending"><p class="big">${esc(t('ending_the_end'))}</p><p class="credits" style="white-space:pre-line">${esc(t('credits'))}</p>
          <div class="row"><button class="btn primary" data-a="map">${esc(t('ui_play_again'))}</button></div></div>`, 'dim');
        on(d, '[data-a=map]', onDone);
      };
      show(0);
    },

    // ---------------- HUD ----------------
    hud: {
      show(v) { $('hud').classList.toggle('hidden', !v); $('touch').classList.toggle('on', !!v); },
      hearts(n, max) {
        const el = $('hearts'); let h = '';
        for (let i = 0; i < max; i++) h += `<div class="heart ${i < n ? '' : 'empty'}"></div>`;
        el.innerHTML = h;
      },
      row2(html) { $('hud-row2').innerHTML = html || ''; },
      cakes(n, max) { let h = `<span>${esc(t('hud_oma'))}</span>`; for (let i = 0; i < max; i++) h += `<div class="cake ${i < n ? '' : 'empty'}"></div>`; UI.hud.row2(h); },
      items(got) { UI.hud.row2(got.map((g, i) => `<div class="item i${i} ${g ? 'got' : ''}"></div>`).join('')); },
      bottles(n) { const el = $('bottles'); if (el.textContent !== String(n)) { el.textContent = n; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } },
      progress(f) { $('progress').classList.toggle('hidden', f === null); if (f !== null) $('progress-dot').style.left = (Math.max(0, Math.min(1, f)) * 100) + '%'; },
      boss(f) { $('bossbar').classList.toggle('hidden', f === null); if (f !== null) $('bossbar-fill').style.width = (Math.max(0, f) * 100) + '%'; },
      special(visible, frac, ready) {
        const b = $('btn-special'); b.classList.toggle('hidden', !visible);
        if (!visible) return;
        b.style.setProperty('--charge', Math.round(Math.min(1, frac) * 360) + 'deg');
        b.classList.toggle('ready', !!ready);
      },
      toast(text, ms) {
        const el = $('toast'); el.textContent = text; el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
        clearTimeout(UI._toastT); UI._toastT = setTimeout(() => el.classList.add('hidden'), ms || 2200);
      },
      // the active Kiosk-Tuete boon (icon under the hearts); id null hides it
      boon(id) {
        const el = $('hud-boon'); if (!el) return;
        if (!id) { el.classList.add('hidden'); el.removeAttribute('data-id'); return; }
        if (el.dataset.id === id) return;
        const AS = window.ART_MANIFEST.assets, a1 = AS.find(x => x.key === 'ui_boon_icons'), a2 = AS.find(x => x.key === 'ui_boon_icons2');
        const a = a1.frames[id] === undefined && a2 && a2.frames[id] !== undefined ? a2 : a1, f = a.frames[id] || 0;
        el.dataset.id = id; el.classList.remove('hidden');
        el.style.backgroundImage = `url(assets/art/${a.path})`;
        el.style.backgroundSize = `${(a.imgW || a.frameCount * 16) * 2}px ${(a.imgH || 16) * 2}px`;
        el.style.backgroundPosition = `${-f * 32}px 0`;
        el.title = t('ui_boon_active', { N: t('boon_' + id + '_name') });
      },
      boonUsed(id) { const el = $('hud-boon'); if (el) { el.classList.remove('used'); void el.offsetWidth; el.classList.add('used'); } },
      warn(text) { const el = $('warn'); if (text) { el.textContent = text; el.classList.remove('hidden'); } else el.classList.add('hidden'); },
      sign(text) {
        const el = $('signbox');
        if (!text) { el.classList.add('hidden'); return; }
        if (el.textContent === text && !el.classList.contains('hidden')) return;
        el.textContent = text; el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
      },
    },
    refreshRotate() { $('rotate-text').textContent = t(window.FS && FS.armed ? 'ui_rotate_fs' : 'ui_rotate'); },
  };
  $('btn-pause').addEventListener('pointerdown', e => { e.stopPropagation(); if (INPUT.onPause) INPUT.onPause(); });
  $('btn-special').addEventListener('pointerdown', e => { e.stopPropagation(); if (INPUT.onSpecial) INPUT.onSpecial(); });
  window.UI = UI;
})();
