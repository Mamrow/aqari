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
