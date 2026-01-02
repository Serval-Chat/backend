// Utility script to generate VAPID keys for Web Push notifications
import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();
console.log('VAPID Public Key:', vapidKeys.publicKey);
console.log('VAPID Private Key:', vapidKeys.privateKey);
