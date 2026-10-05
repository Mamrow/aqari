// Shareable links to a single listing.
//
// A share or a WhatsApp message carries an https link to the website
// (legal/site/l/), not the app's own aqari:// link. Messaging apps only make
// http(s) tappable, and someone without the app needs somewhere to land. That
// page shows the listing and an "Open in Aqari" button that hands off to
// aqari://listing/<id>, which App.js turns into a jump to the listing screen.
//
// The aqari scheme is registered natively from app.json's "scheme", so builds
// already on phones open these links. Only the JS that reads them is new.

const WEB_BASE = 'https://lyaqari.netlify.app/l/';
const APP_PREFIX = 'aqari://listing/';

export function listingWebLink(listingId) {
  return `${WEB_BASE}${encodeURIComponent(listingId)}`;
}

// The listing id from either link form, or null for anything else (including
// the dev client's own exp+aqari:// launch URLs).
export function listingIdFromUrl(url) {
  if (typeof url !== 'string') return null;
  for (const prefix of [APP_PREFIX, WEB_BASE]) {
    if (url.startsWith(prefix)) {
      const id = decodeURIComponent(url.slice(prefix.length).split(/[/?#]/)[0]);
      return id || null;
    }
  }
  return null;
}
