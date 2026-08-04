import { Linking } from 'react-native';

export function callAgent(phone) {
  Linking.openURL(`tel:${phone}`);
}

export function whatsappAgent(phone, message) {
  const digitsOnly = phone.replace(/[^\d]/g, '');
  Linking.openURL(`https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`);
}
