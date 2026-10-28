const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const crypto = require('node:crypto');
initializeApp();
const db = getDatabase();
const DURATION_MS = 180000;
const clean = (s, max=80) => String(s ?? '').trim().replace(/[<>]/g,'').slice(0,max);
const isAdmin = request => request.auth?.token?.admin === true;
function requireAdmin(request) { if (!isAdmin(request)) throw new HttpsError('permission-denied','Akses hanya untuk admin RC Queue.'); }
function phoneHash(phone) { return crypto.createHash('sha256').update(phone).digest('hex'); }
async function sendToTokens(tokens, title, body, url='/') {
  const unique=[...new Set((tokens||[]).filter(Boolean))]; if(!unique.length)return;
  for(let i=0;i<unique.length;i+=500){const chunk=unique.slice(i,i+500);try{await getMessaging().sendEachForMulticast({tokens:chunk,notification:{title,body},data:{url},webpush:{notification:{icon:'/icon.svg',badge:'/icon.svg'},fcmOptions:{link:url}}});}catch(e){console.error('FCM send failed:',e.message);}}
}
async function tokensForRole(role, ticketId) {
  const snap=await db.ref('pushTokens').once('value'); const data=snap.val()||{}; const result=[];
  for(const [key,item] of Object.entries(data)){if(item?.role===role && (!ticketId || item.ticketId===ticketId) && item.token)result.push(item.token);}return result;
}
async function notifyAdmins(title,body){await sendToTokens(await tokensForRole('admin'),title,body,'/admin.html');}
async function publishQueue(queue) {
  const pub={}, tickets={};
  for(const [id,p] of Object.entries(queue||{})){
    const safe={id, name:p.name, number:p.number, status:p.status, createdAt:p.createdAt||0, startedAt:p.startedAt||null, endsAt:p.endsAt||null, endedAt:p.endedAt||null};
    if(['waiting','active'].includes(p.status))pub[id]=safe;
    tickets[id]={id, name:p.name, number:p.number, status:p.status, createdAt:p.createdAt||0, startedAt:p.startedAt||null, endsAt:p.endsAt||null, endedAt:p.endedAt||null};
  }
  await db.ref('publicQueue').set(pub); await db.ref('publicTickets').set(tickets);
}
exports.joinQueue = onCall({ cors: true, enforceAppCheck: false }, async request => {
  const name=clean(request.data?.name,40); let phone=clean(request.data?.phone,20).replace(/[\s()-]/g,'');
  if(name.length<2)throw new HttpsError('invalid-argument','Nama minimal 2 karakter.');
  if(!/^\+?[0-9]{8,16}$/.test(phone))throw new HttpsError('invalid-argument','Nomor WhatsApp tidak valid.');
  const phoneKey=phoneHash(phone); const queueRef=db.ref('privateQueue');
  const result=await queueRef.transaction(queue=>{
    queue=queue||{};
    const duplicate=Object.values(queue).some(p=>p.phoneHash===phoneKey && ['waiting','active'].includes(p.status));
    if(duplicate)return;
    const active=Object.values(queue).some(p=>p.status==='active');
    const waiting=Object.values(queue).filter(p=>p.status==='waiting');
    const max=Object.values(queue).reduce((n,p)=>Math.max(n,Number(p.number)||0),0);
    const id=db.ref('privateQueue').push().key;
    queue[id]={id,name,phone,phoneHash:phoneKey,number:String(max+1).padStart(3,'0'),status:'waiting',createdAt:Date.now(),startedAt:null,endsAt:null,endedAt:null};
    return queue;
  });
  if(!result.committed)throw new HttpsError('already-exists','Nomor ini sudah memiliki antrean aktif.');
  const queue=result.snapshot.val()||{};const player=Object.values(queue).find(p=>p.phoneHash===phoneKey && p.status==='waiting');
  await publishQueue(queue);
  await notifyAdmins('Antrean RC baru',`${player.name} mendaftar — antrean #${player.number}.`);
  return {ticketId:player.id,number:player.number};
});
exports.savePushToken = onCall({ cors: true, enforceAppCheck: false }, async request => {
  const token=clean(request.data?.token,4096);const role=request.data?.role;const ticketId=clean(request.data?.ticketId,100)||null;
  if(!token||token.length<30)throw new HttpsError('invalid-argument','Token notifikasi tidak valid.');
  if(role==='admin') { requireAdmin(request); }
  else if(role==='player') { if(!ticketId)throw new HttpsError('invalid-argument','Daftar antrean terlebih dahulu, lalu aktifkan notifikasi.'); const snap=await db.ref(`privateQueue/${ticketId}`).once('value');if(!snap.exists())throw new HttpsError('not-found','Tiket antrean tidak ditemukan.'); }
  else throw new HttpsError('invalid-argument','Jenis perangkat tidak valid.');
  const key=crypto.createHash('sha256').update(token).digest('hex');await db.ref(`pushTokens/${key}`).set({token,role,ticketId,updatedAt:Date.now(),uid:request.auth?.uid||null});return {ok:true};
});
exports.startSession = onCall({ cors: true }, async request => {
  requireAdmin(request);const ticketId=clean(request.data?.ticketId,100);if(!ticketId)throw new HttpsError('invalid-argument','Tiket tidak valid.');
  const now=Date.now();const tx=await db.ref('privateQueue').transaction(queue=>{if(!queue)return;const active=Object.values(queue).some(p=>p.status==='active');const p=queue[ticketId];if(active||!p||p.status!=='waiting')return;p.status='active';p.startedAt=now;p.endsAt=now+DURATION_MS;p.endedAt=null;return queue;});
  if(!tx.committed)throw new HttpsError('failed-precondition','Tidak bisa memulai: mungkin ada sesi aktif atau pemain sudah tidak menunggu.');
  const queue=tx.snapshot.val(),p=queue[ticketId];await publishQueue(queue);await sendToTokens(await tokensForRole('player',ticketId),'Giliranmu bermain RC!',`Hai ${p.name}, sesi bermainmu dimulai sekarang. Waktu bermain 3 menit.`, '/');return {ok:true,endsAt:p.endsAt};
});
exports.finishSession = onCall({ cors: true }, async request => {
  requireAdmin(request);const ticketId=clean(request.data?.ticketId,100);const now=Date.now();const tx=await db.ref('privateQueue').transaction(queue=>{if(!queue||!queue[ticketId]||queue[ticketId].status!=='active')return;queue[ticketId].status='done';queue[ticketId].endedAt=now;return queue;});
  if(!tx.committed)throw new HttpsError('failed-precondition','Sesi aktif tidak ditemukan.');const queue=tx.snapshot.val(),p=queue[ticketId];await publishQueue(queue);await sendToTokens(await tokensForRole('player',ticketId),'Sesi bermain selesai','Waktu bermainmu sudah berakhir. Terima kasih sudah bermain!','/');return {ok:true};
});
exports.skipTicket = onCall({ cors: true }, async request => {
  requireAdmin(request);const ticketId=clean(request.data?.ticketId,100);const now=Date.now();const tx=await db.ref('privateQueue').transaction(queue=>{if(!queue||!queue[ticketId]||!['waiting','active'].includes(queue[ticketId].status))return;queue[ticketId].status='skipped';queue[ticketId].endedAt=now;return queue;});
  if(!tx.committed)throw new HttpsError('failed-precondition','Pemain tidak ditemukan dalam antrean aktif.');const queue=tx.snapshot.val(),p=queue[ticketId];await publishQueue(queue);await sendToTokens(await tokensForRole('player',ticketId),'Antrean diperbarui',`Status antrean ${p.number} berubah. Silakan hubungi admin jika ini tidak disengaja.`,'/');return {ok:true};
});
// Runs once per minute. The website timer reaches 00:00 at the exact deadline; server state/push cleanup occurs on this scheduled check.
exports.expireSessions = onSchedule('every 1 minutes', async () => {
  const snap=await db.ref('privateQueue').once('value');const queue=snap.val()||{};const now=Date.now();let changed=false;const ended=[];
  for(const p of Object.values(queue)){if(p.status==='active'&&p.endsAt&&p.endsAt<=now){p.status='done';p.endedAt=now;changed=true;ended.push(p);}}
  if(changed){await db.ref('privateQueue').set(queue);await publishQueue(queue);for(const p of ended)await sendToTokens(await tokensForRole('player',p.id),'Waktu bermain habis!','3 menitmu selesai. Silakan bersiap untuk pemain berikutnya.','/');}
});
