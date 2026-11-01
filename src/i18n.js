// Text lookup. All strings live in design/data/text_de_en.json (bundled into src/data.js).
(function () {
  const TEXT = window.GAME_DATA.text;
  // A few UI strings the design text file does not cover.
  const EXTRA = {
    de: { ui_level: 'Mission {N}', ui_back: 'Zurück', ui_credits: 'Abspann', ui_play_again: 'Zur Karte', ui_paused: 'Pause',
      ui_new_best: 'Neu freigeschaltet: Mission {N}', ui_sound: 'Ton', ui_lang_toggle: 'English', ui_from: 'Von: {N}',
      credits: 'Idee: Le Punk · Spieldesign: MVP Systems Designer · Grafik: MVP Tech Artist · Code: Grok Bot\nEngine: Phaser 3 (MIT) · Schriften: Pixelify Sans, Silkscreen (SIL OFL 1.1) · Töne: live im Browser erzeugt',
      special_locked: 'Knödelkanone? Gibt\'s in {KIOSK}.',
      ui_rotate_fs: 'Handy drehen & tippen für Vollbild', ui_fs_on: 'Vollbild', ui_fs_off: 'Vollbild aus',
      ending_stage1_end: 'Ende von Teil 1', ending_stage1_tease: 'Fortsetzung folgt: Ab nach Soest!' },
    en: { ui_level: 'Mission {N}', ui_back: 'Back', ui_credits: 'Credits', ui_play_again: 'To the map', ui_paused: 'Paused',
      ui_new_best: 'Unlocked: Mission {N}', ui_sound: 'Sound', ui_lang_toggle: 'Deutsch', ui_from: 'From: {N}',
      credits: 'Idea: Le Punk · Game design: MVP Systems Designer · Art: MVP Tech Artist · Code: Grok Bot\nEngine: Phaser 3 (MIT) · Fonts: Pixelify Sans, Silkscreen (SIL OFL 1.1) · Sounds: synthesised live in the browser',
      special_locked: 'Get the dumpling cannon at {KIOSK}.',
      ui_rotate_fs: 'Turn your phone & tap for fullscreen', ui_fs_on: 'Fullscreen', ui_fs_off: 'Exit fullscreen',
      ending_stage1_end: 'End of Stage 1', ending_stage1_tease: 'To be continued: Off to Soest!' },
  };
  // Wurst, the companion dog (src/dog.js): short, rare lines in his speech bubble. Kept here so an art/data re-sync can't wipe them.
  Object.assign(EXTRA.de, {
    dog_name: 'Wurst', dog_wuff: 'Wuff!', dog_wuff_2: 'Wuff wuff!', dog_zombie: 'Böser Zombie!', dog_gnome: 'Der Zwerg riecht komisch.',
    dog_dackel: 'Cousin? Nee.', dog_sniff_1: 'Pfand! Riecht nach 25 Cent.', dog_sniff_2: 'Ist da Milch drin?', dog_sniff_3: 'Schnüffel, schnüffel.',
    dog_joke_1: 'Sind wir bald da?', dog_joke_2: 'Ich kämpf nicht. Ich lauf nur mit.', dog_joke_3: 'Ich heiße Wurst. Nicht essen!',
    dog_joke_4: 'Milch? Ich wär für Leberwurst.', dog_joke_5: 'Gut, dass ich kein Zombie-Dackel bin.', dog_joke_6: 'Gassi mit Skateboard. Läuft!',
    dog_joke_7: '{HERO}, warte auf mich!', dog_intro: 'Ich bin Wurst. Ich komm mit!', dog_yikes: 'Huch!', dog_hurt: 'Alles gut, {HERO}?',
    dog_win: 'Wuff! Leckerli?', dog_sad: 'Winsel…', dog_ride: 'Schneller! Der Laster!', dog_boss: 'Der Stempel macht mir Angst.',
    dog_oma: 'Oma Ronni hat immer Leckerli.', dog_buy: 'Wuff! Gute Wahl!', dog_ending: 'Und Wurst kriegt eine Wurst. Wuff!',
  });
  Object.assign(EXTRA.en, {
    dog_name: 'Wurst', dog_wuff: 'Woof!', dog_wuff_2: 'Woof woof!', dog_zombie: 'Bad zombie!', dog_gnome: 'That gnome smells funny.',
    dog_dackel: 'Cousin? Nope.', dog_sniff_1: 'Pfand! Smells like 25 cents.', dog_sniff_2: 'Any milk in there?', dog_sniff_3: 'Sniff, sniff.',
    dog_joke_1: 'Are we there yet?', dog_joke_2: "I don't fight. I just tag along.", dog_joke_3: "I'm called Wurst. Don't eat me!",
    dog_joke_4: 'Milk? I vote liver sausage.', dog_joke_5: "Glad I'm no zombie dachshund.", dog_joke_6: 'Walkies on a skateboard. Nice!',
    dog_joke_7: '{HERO}, wait for me!', dog_intro: "I'm Wurst. I'm coming too!", dog_yikes: 'Yikes!', dog_hurt: 'You okay, {HERO}?',
    dog_win: 'Woof! Treat?', dog_sad: 'Whimper…', dog_ride: 'Faster! The truck!', dog_boss: 'That stamp scares me.',
    dog_oma: 'Oma Ronni always has treats.', dog_buy: 'Woof! Good pick!', dog_ending: 'And Wurst gets a sausage. Woof!',
  });
  let lang = 'de';
  const L = window.MH.i18n;
  const I18N = {
    setLang(l) { lang = L.normLang(l); document.documentElement.lang = lang; },
    get lang() { return lang; },
    t: L.translator(TEXT, EXTRA, () => lang, () => I18N.hero()),
  };
  // The kiosk owner's name is never hard-coded: it comes from the text data ("Xs Kiosk" / "X's Kiosk").
  // {HERO}: config.js heroName if set, otherwise names.HERO from the design text data
  I18N.hero = () => L.heroName(window.MILCH_CONFIG, TEXT);
  I18N.owner = () => L.ownerOf(I18N.t('kiosk_name'));
  window.I18N = I18N;
  window.t = I18N.t;
})();
