// ============================================
// CREATE FIRST ADMIN - Instructions & Scripts
// ============================================

/*
Method 1: Firebase Console (Easiest for beginners)
==================================================

1. Go to https://console.firebase.google.com
2. Select your "entry-karo" project
3. Click "Firestore Database" from left menu
4. Click "+ Start collection"
5. Collection ID: admins
6. Document ID: admin1 (or any username you want)
7. Add these fields:

   Field: adminId      Type: string      Value: admin1
   Field: passwordHash Type: string      Value: 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8
   Field: createdAt    Type: number      Value: 1700000000000 (or use current timestamp)

8. Click "Save"

The passwordHash above is SHA-256 hash of "password"
You can generate your own hash using the function below.

*/

/*
Method 2: Using Browser Console (Quick)
========================================

1. Open admin panel in browser
2. Open Developer Tools (F12)
3. Go to Console tab
4. Paste this code and press Enter:

*/

// Run this in browser console at the admin panel page
async function createFirstAdmin() {
    const adminId = 'admin1';
    const password = 'password'; // Change this!
    
    // SHA-256 hash function
    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    const passwordHash = await sha256(password);
    
    try {
        await firebase.firestore().collection('admins').doc(adminId).set({
            adminId: adminId,
            passwordHash: passwordHash,
            createdAt: Date.now()
        });
        console.log('✅ Admin created successfully!');
        console.log('Admin ID:', adminId);
        console.log('Password:', password);
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Uncomment to run:
// createFirstAdmin();

/*
Method 3: Node.js Script (For developers)
==========================================

1. Create file: create-admin.js
2. Run: node create-admin.js

*/

const createAdminScript = `
const admin = require('firebase-admin');

// Download service account key from Firebase Console
// Project Settings > Service Accounts > Generate New Private Key
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createAdmin() {
  const adminId = 'admin1';
  const password = 'password'; // Change this!
  
  // SHA-256 hash
  const crypto = require('crypto');
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  
  try {
    await db.collection('admins').doc(adminId).set({
      adminId: adminId,
      passwordHash: passwordHash,
      createdAt: Date.now()
    });
    console.log('✅ Admin created successfully!');
    console.log('Admin ID:', adminId);
    console.log('Password:', password);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createAdmin();
`;

// ============================================
// HELPER: Password Hash Generator
// ============================================

// Use this to generate password hashes
async function generatePasswordHash(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Example usage:
// generatePasswordHash('yourPassword').then(hash => console.log(hash));

// ============================================
// DEFAULT LOGIN CREDENTIALS (After Creation)
// ============================================

/*
Admin ID: admin1
Password: password

IMPORTANT: Change the default password after first login!
*/

export { createFirstAdmin, generatePasswordHash };
