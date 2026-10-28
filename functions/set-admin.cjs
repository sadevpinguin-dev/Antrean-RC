
const admin = require("firebase-admin");
const readline = require("node:readline/promises");

async function main() {
  const email = process.argv[2];
  const projectId = process.env.GCLOUD_PROJECT;

  if (!email || !projectId) {
    throw new Error(
      "Project ID belum diatur atau email admin belum diberikan."
    );
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });

  const auth = admin.auth();
  const user = await auth.getUserByEmail(email);

  const claims = {
    ...(user.customClaims || {}),
    admin: true,
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      `Berikan akses ADMIN kepada ${user.email} pada project ${projectId}? Ketik YA: `
    );

    if (answer.trim() !== "YA") {
      console.log("Dibatalkan.");
      return;
    }

    await auth.setCustomUserClaims(user.uid, claims);

    console.log(`Berhasil: ${user.email} sekarang memiliki klaim admin.`);
    console.log("Silakan login ulang ke RC Queue System.");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error("Gagal:", error.message);
  process.exitCode = 1;
});
