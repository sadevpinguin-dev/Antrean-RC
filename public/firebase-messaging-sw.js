/* Firebase Messaging service worker. Config must match public/firebase-config.js. */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');
const firebaseConfig={apiKey:'GANTI_API_KEY',authDomain:'GANTI_PROJECT_ID.firebaseapp.com',databaseURL:'https://GANTI_DATABASE_NAME.REGION.firebasedatabase.app',projectId:'GANTI_PROJECT_ID',storageBucket:'GANTI_PROJECT_ID.firebasestorage.app',messagingSenderId:'GANTI_SENDER_ID',appId:'GANTI_APP_ID'};
firebase.initializeApp(firebaseConfig);const messaging=firebase.messaging();
messaging.onBackgroundMessage(payload=>{const title=payload.notification?.title||'RC Queue';const options={body:payload.notification?.body||'Ada pembaruan antrean RC.',icon:'/icon.svg',badge:'/icon.svg',data:{url:payload.data?.url||'/'}};self.registration.showNotification(title,options);});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=event.notification.data?.url||'/';event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus'in c){c.navigate(url);return c.focus();}}return clients.openWindow(url);}));});
