// Jalankan hanya dari komputer pemilik project setelah firebase-admin terpasang.
// Cara yang disarankan: firebase login, lalu gunakan Admin SDK dengan Application Default Credentials.
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT });
async function main(){
  const email=process.argv[2];
  if(!email){console.error('Pemakaian: GCLOUD_PROJECT=project-id node set-admin.js admin@email.com');process.exit(1);}
  const user=await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid,{...(user.customClaims||{}),admin:true});
  console.log(`Akses admin diberikan ke ${email} (UID ${user.uid}). Minta admin login ulang agar claim diperbarui.`);
}
main().catch(e=>{console.error(e);process.exit(1);});
