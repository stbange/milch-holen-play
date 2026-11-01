// Text lookup rules (spec: i18n): language fallback, {HERO} / {KIOSK} / {VAR} placeholders, kiosk owner name.
(function (root) {
  'use strict';
  const normLang = l => (l === 'en') ? 'en' : 'de';
  const heroName = (cfg, TEXT) => (cfg && String(cfg.heroName || '').trim()) || (TEXT.names && TEXT.names.HERO) || 'Skater';
  // translator over the design text (TEXT) and the extra strings; getLang / getHero are read on every call
  function translator(TEXT, EXTRA, getLang, getHero) {
    function t(key, vars) {
      const lang = getLang();
      let s = (TEXT[lang] && TEXT[lang][key]) || (EXTRA[lang] && EXTRA[lang][key]) || (TEXT.de[key]) || key;
      s = s.replace(/\{HERO\}/g, getHero());
      if (s.indexOf('{KIOSK}') >= 0) s = s.replace(/\{KIOSK\}/g, t('kiosk_name'));
      if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      return s;
    }
    return t;
  }
  // "Ronnis Kiosk" / "Ronni's Kiosk" -> "Ronni"
  const ownerOf = kioskName => kioskName.replace(/[’']?s?\s+Kiosk$/i, '').trim();
  const api = { normLang, heroName, translator, ownerOf };
  const MH = root.MH || (root.MH = {}); MH.i18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
