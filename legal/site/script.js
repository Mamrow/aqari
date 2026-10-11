function aqariSetLang(lang) {
  var isAr = lang === 'ar';
  var en = document.getElementById('content-en');
  var ar = document.getElementById('content-ar');
  if (en) en.hidden = isAr;
  if (ar) ar.hidden = !isAr;
  var btnEn = document.getElementById('btnEn');
  var btnAr = document.getElementById('btnAr');
  if (btnEn) btnEn.setAttribute('aria-pressed', String(!isAr));
  if (btnAr) btnAr.setAttribute('aria-pressed', String(isAr));
  document.documentElement.setAttribute('lang', lang);
  // The content blocks carry their own dir, but the top bar and footer are
  // shared, so the page itself has to flip too, or they stay left-to-right
  // with English labels in the middle of an Arabic page. Shared labels carry
  // their Arabic in data-ar; the English is kept in data-en on first switch.
  document.documentElement.setAttribute('dir', isAr ? 'rtl' : 'ltr');
  var labels = document.querySelectorAll('[data-ar]');
  for (var i = 0; i < labels.length; i++) {
    var el = labels[i];
    if (!el.hasAttribute('data-en')) el.setAttribute('data-en', el.textContent);
    el.textContent = el.getAttribute(isAr ? 'data-ar' : 'data-en');
  }
  try { localStorage.setItem('aqari-legal-lang', lang); } catch (e) {}
}

(function aqariInitLang() {
  var saved = null;
  try { saved = localStorage.getItem('aqari-legal-lang'); } catch (e) {}
  if (!saved) {
    var browserLang = (navigator.language || '').toLowerCase();
    saved = browserLang.indexOf('ar') === 0 ? 'ar' : 'en';
  }
  document.addEventListener('DOMContentLoaded', function () {
    aqariSetLang(saved);
  });
})();

// Store links for every page that shows the badges (the home page, which is
// also served at /download, and the shared-listing page /l/).
// PLAY_LIVE stays false until Google approves the production release: until
// then the Play page reads "item not found" to anyone outside the closed test,
// so the Play badge says "coming soon" instead. Flip it, rebuild
// legal/site.zip and redeploy once the app is public on Play.
var AQARI_STORES = {
  appStore: 'https://apps.apple.com/app/id6809884623',
  playStore: 'https://play.google.com/store/apps/details?id=com.mamrow.aqari',
  PLAY_LIVE: false,
};

var AQARI_UA = navigator.userAgent || '';
// iPadOS reports itself as a Mac; a touch screen tells them apart.
var AQARI_IS_IOS = /iPhone|iPad|iPod/i.test(AQARI_UA) || (/Macintosh/.test(AQARI_UA) && navigator.maxTouchPoints > 1);
var AQARI_IS_ANDROID = /Android/i.test(AQARI_UA);

var AQARI_BADGE_ICONS = {
  appStore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
  playStore: '<svg viewBox="0 0 24 24" aria-hidden="true">'
    + '<path fill="#4285F4" d="M1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924z"/>'
    + '<path fill="#34A853" d="M13.544 10.989l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973z"/>'
    + '<path fill="#FBBC04" d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594z"/>'
    + '<path fill="#EA4335" d="M13.544 13.056l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z"/></svg>',
};

// Fills every <a class="store-badge" data-store="appStore|playStore">, and
// puts the visitor's own store first.
function aqariRenderBadges() {
  var badges = document.querySelectorAll('.store-badge[data-store]');
  for (var i = 0; i < badges.length; i++) {
    var a = badges[i];
    var store = a.getAttribute('data-store');
    var live = store === 'appStore' || AQARI_STORES.PLAY_LIVE;
    var small = store === 'appStore' ? 'Download on the' : live ? 'GET IT ON' : 'COMING SOON TO';
    var big = store === 'appStore' ? 'App Store' : 'Google Play';
    a.innerHTML = AQARI_BADGE_ICONS[store]
      + '<span class="store-badge-text"><span class="store-badge-small">' + small
      + '</span><span class="store-badge-big">' + big + '</span></span>';
    a.setAttribute('aria-label', (live ? '' : 'Coming soon: ') + big);
    if (live) { a.href = AQARI_STORES[store]; a.removeAttribute('aria-disabled'); }
    else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
    var mineFirst = (store === 'appStore' && AQARI_IS_IOS) || (store === 'playStore' && AQARI_IS_ANDROID && live);
    if (mineFirst) a.parentNode.insertBefore(a, a.parentNode.firstChild);
  }
}
document.addEventListener('DOMContentLoaded', aqariRenderBadges);
