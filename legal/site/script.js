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
