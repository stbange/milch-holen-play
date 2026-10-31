// Text lookup. All strings live in design/data/text_de_en.json (bundled into src/data.js).
(function () {
  const TEXT = window.GAME_DATA.text;
  // A few UI strings the design text file does not cover.
  const EXTRA = {
    de: { ui_level: 'Mission {N}', ui_back: 'Zurück', ui_credits: 'Abspann', ui_play_again: 'Zur Karte', ui_paused: 'Pause',
      ui_new_best: 'Neu freigeschaltet: Mission {N}', ui_sound: 'Ton', ui_lang_toggle: 'English', ui_from: 'Von: {N}',
      credits: 'Idee: Le Punk · Spieldesign: MVP Systems Designer · Grafik: MVP Tech Artist · Code: Grok Bot\nEngine: Phaser 3 (MIT) · Schriften: Pixelify Sans, Silkscreen (SIL OFL 1.1) · Töne: live im Browser erzeugt',
      special_locked: 'Knödelkanone? Gibt\'s in {KIOSK}.',
      ui_rotate_fs: 'Handy drehen & tippen für Vollbild', ui_fs_on: 'Vollbild', ui_fs_off: 'Vollbild aus' },
    en: { ui_level: 'Mission {N}', ui_back: 'Back', ui_credits: 'Credits', ui_play_again: 'To the map', ui_paused: 'Paused',
      ui_new_best: 'Unlocked: Mission {N}', ui_sound: 'Sound', ui_lang_toggle: 'Deutsch', ui_from: 'From: {N}',
      credits: 'Idea: Le Punk · Game design: MVP Systems Designer · Art: MVP Tech Artist · Code: Grok Bot\nEngine: Phaser 3 (MIT) · Fonts: Pixelify Sans, Silkscreen (SIL OFL 1.1) · Sounds: synthesised live in the browser',
      special_locked: 'Get the dumpling cannon at {KIOSK}.',
      ui_rotate_fs: 'Turn your phone & tap for fullscreen', ui_fs_on: 'Fullscreen', ui_fs_off: 'Exit fullscreen' },
  };
  let lang = 'de';
  const I18N = {
    setLang(l) { lang = (l === 'en') ? 'en' : 'de'; document.documentElement.lang = lang; },
    get lang() { return lang; },
    t(key, vars) {
      let s = (TEXT[lang] && TEXT[lang][key]) || (EXTRA[lang] && EXTRA[lang][key]) || (TEXT.de[key]) || key;
      const hero = I18N.hero();
      s = s.replace(/\{HERO\}/g, hero);
      if (s.indexOf('{KIOSK}') >= 0) s = s.replace(/\{KIOSK\}/g, I18N.t('kiosk_name'));
      if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      return s;
    },
  };
  // The kiosk owner's name is never hard-coded: it comes from the text data ("Xs Kiosk" / "X's Kiosk").
  // {HERO}: config.js heroName if set, otherwise names.HERO from the design text data
  I18N.hero = () => (window.MILCH_CONFIG && String(window.MILCH_CONFIG.heroName || '').trim()) || (TEXT.names && TEXT.names.HERO) || 'Skater';
  I18N.owner = () => I18N.t('kiosk_name').replace(/[’']?s?\s+Kiosk$/i, '').trim();
  window.I18N = I18N;
  window.t = I18N.t;
})();
