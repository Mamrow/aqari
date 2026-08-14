import { Linking } from 'react-native';

// Linking.openURL rejects (doesn't throw synchronously) when there's no app
// installed to handle the URL — tel: almost always has a dialer on a real
// phone, but https://wa.me/... very much doesn't if the buyer just doesn't
// have WhatsApp installed. Left uncaught, that rejection was completely
// silent: tap the button, nothing happens, no error, no feedback — the
// exact same "looks like it worked, didn't" class of bug already fixed once
// in this codebase (see submitListing's history). onError is optional so
// existing call sites that don't care about feedback (e.g. admin's own
// contact-row taps) keep working unchanged.
export function callAgent(phone, onError) {
  Linking.openURL(`tel:${phone}`).catch(() => onError?.());
}

export function whatsappAgent(phone, message, onError) {
  const digitsOnly = phone.replace(/[^\d]/g, '');
  Linking.openURL(`https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`).catch(() => onError?.());
}
