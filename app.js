// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCT6nxmheCD98oPMyDoRWhC_2taZS6i6Vg",
    authDomain: "entry-karo.firebaseapp.com",
    projectId: "entry-karo",
    storageBucket: "entry-karo.firebasestorage.app",
    messagingSenderId: "411034527445",
    appId: "1:411034527445:web:ab41c39936cab2fd53645c",
    measurementId: "G-2YJNXEJBH4"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Admin state
let currentAdmin = null;
let users = [];
let deposits = [];
let receivedEntries = [];
let activityListeners = [];

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const createUserModal = document.getElementById('createUserModal');
const createUserForm = document.getElementById('createUserForm');

// Auth state
let auth = firebase.auth();

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

const addReceivedModal = document.getElementById('addReceivedModal');
const addReceivedForm = document.getElementById('addReceivedForm');

// Hash utility function - SHA-256
async function hashString(str) {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    
    try {
        // Step 1: Authenticate with Firebase Auth
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;
        
        // Step 2: Verify admin exists in Firestore
        const adminDoc = await db.collection('admins').doc(uid).get();
        
        if (!adminDoc.exists) {
            // Not an admin, sign out
            await auth.signOut();
            loginError.textContent = 'Access denied. Not an authorized admin.';
            return;
        }
        
        const adminData = adminDoc.data();
        currentAdmin = { id: uid, email: email, ...adminData };
        showDashboard();
        loadDashboardData();
        
    } catch (error) {
        console.error('Login error:', error);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            loginError.textContent = 'Invalid email or password';
        } else if (error.code === 'auth/invalid-email') {
            loginError.textContent = 'Invalid email format';
        } else {
            loginError.textContent = 'Login failed. Please try again.';
        }
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    try {
        await auth.signOut();
    } catch (e) {
        console.error('Logout error:', e);
    }
    currentAdmin = null;
    showLogin();
});

// Navigation
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        
        // Update active nav item
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Hide all pages
        pages.forEach(p => p.classList.add('hidden'));
        
        // Show selected page
        document.getElementById(`page-${page}`).classList.remove('hidden');
        
        // Update page title
        const titles = {
            'dashboard': 'Dashboard',
            'approvals': 'User Approvals',
            'users': 'User Management',
            'received': 'Received Entries',
            'deposits': 'Deposit Approvals',
            'settings': 'Settings',
            'user-detail': 'User Details'
        };
        document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';
        
        // Load page data
        if (page === 'users' || page === 'user-detail') {
            loadUsers();
        } else if (page === 'deposits') {
            loadDeposits();
        } else if (page === 'received') {
            loadReceivedEntries();
        } else if (page === 'settings') {
            loadSettings();
        } else if (page === 'approvals') {
            loadUserApprovals();
        }
        
        // Close sidebar on mobile
        closeSidebar();
    });
});

function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
}

function showLogin() {
    loginScreen.classList.remove('hidden');
    dashboardScreen.classList.add('hidden');
    loginForm.reset();
}

// Load Dashboard Data
async function loadDashboardData() {
    try {
        // Get total users
        const usersSnapshot = await db.collection('users').get();
        users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        document.getElementById('totalUsers').textContent = users.length;
        
        // Calculate total balance from all users
        const totalBalance = users.reduce((sum, user) => sum + (user.balance || 0), 0);
        document.getElementById('totalBalance').textContent = '₹' + totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 });
        
        // Calculate active users (lastLogin within 5 minutes)
        const now = Date.now();
        const fiveMinutesAgo = now - (5 * 60 * 1000);
        const activeUsersCount = users.filter(user => user.lastLogin && user.lastLogin >= fiveMinutesAgo).length;
        document.getElementById('activeUsers').textContent = activeUsersCount;
        
        // Get pending deposits
        const depositsSnapshot = await db.collection('depositEntries')
            .where('status', '==', 'pending')
            .get();
        deposits = depositsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        document.getElementById('pendingDeposits').textContent = deposits.length;
        
        // Update quick action buttons
        document.querySelector('.action-btn:nth-child(1) small').textContent = `${users.length} total users`;
        document.querySelector('.action-btn:nth-child(2) small').textContent = `${deposits.length} pending`;
        
        // Setup real-time listeners for Recent Activity
        setupActivityListeners();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Load User Approvals (Pending Users)
async function loadUserApprovals() {
    try {
        const pendingSnapshot = await db.collection('users')
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .get();
        
        const pendingUsers = pendingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const tbody = document.getElementById('approvalsTableBody');
        const noApprovalsMsg = document.getElementById('noApprovalsMessage');
        
        if (pendingUsers.length === 0) {
            tbody.innerHTML = '';
            noApprovalsMsg.classList.remove('hidden');
            return;
        }
        
        noApprovalsMsg.classList.add('hidden');
        tbody.innerHTML = pendingUsers.map(user => `
            <tr>
                <td>${user.email || 'N/A'}</td>
                <td><code>${user.uid || user.id}</code></td>
                <td>${user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Unknown'}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-approve" onclick="approveUser('${user.id}')">Approve</button>
                        <button class="btn-reject" onclick="rejectUser('${user.id}')">Reject</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading user approvals:', error);
    }
}

// Approve User
async function approveUser(userId) {
    if (!confirm('Are you sure you want to approve this user?')) return;
    
    try {
        await db.collection('users').doc(userId).update({
            status: 'active',
            approvedAt: Date.now(),
            approvedBy: currentAdmin.id
        });
        
        loadUserApprovals();
        loadUsers();
        loadDashboardData();
        alert('User approved successfully');
    } catch (error) {
        console.error('Error approving user:', error);
        alert('Failed to approve user');
    }
}

// Reject User (Ban)
async function rejectUser(userId) {
    if (!confirm('Are you sure you want to reject this user? Their account will be banned.')) return;
    
    try {
        await db.collection('users').doc(userId).update({
            status: 'banned',
            rejectedAt: Date.now(),
            rejectedBy: currentAdmin.id
        });
        
        loadUserApprovals();
        loadUsers();
        alert('User rejected and banned');
    } catch (error) {
        console.error('Error rejecting user:', error);
        alert('Failed to reject user');
    }
}

// Load Users - Updated to show email instead of UID
async function loadUsers() {
    try {
        const usersSnapshot = await db.collection('users').get();
        users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = users.map(user => `
            <tr onclick="viewUser('${user.id}')" style="cursor: pointer;">
                <td>${user.email || 'N/A'}</td>
                <td>₹${(user.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td><span class="status-badge ${user.status || 'active'}">${user.status || 'Active'}</span></td>
                <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</td>
                <td onclick="event.stopPropagation()">
                    <div class="action-btns">
                        <button class="btn-view" onclick="viewUser('${user.id}')">View</button>
                        <button class="btn-edit" onclick="openEditUserModal('${user.id}')">Edit</button>
                        <button class="btn-reset" onclick="openResetModal('${user.id}')">Reset</button>
                        ${user.status === 'pending' 
                            ? `<button class="btn-approve" onclick="approveUser('${user.id}')">Approve</button>`
                            : ''}
                        ${user.status === 'banned' 
                            ? `<button class="btn-unban" onclick="unbanUser('${user.id}')">Unban</button>`
                            : `<button class="btn-ban" onclick="banUser('${user.id}')">Ban</button>`
                        }
                        <button class="btn-delete" onclick="deleteUser('${user.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Load Deposits - Updated to show email instead of userId
async function loadDeposits() {
    try {
        const depositsSnapshot = await db.collection('depositEntries')
            .orderBy('timestamp', 'desc')
            .get();
        deposits = depositsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Get user emails for display
        const userEmails = {};
        for (const deposit of deposits) {
            if (deposit.userId && !userEmails[deposit.userId]) {
                const userDoc = await db.collection('users').doc(deposit.userId).get();
                userEmails[deposit.userId] = userDoc.exists ? userDoc.data().email : deposit.userId;
            }
        }
        
        const tbody = document.getElementById('depositsTableBody');
        tbody.innerHTML = deposits.map(deposit => `
            <tr>
                <td>${userEmails[deposit.userId] || deposit.userId}</td>
                <td>₹${deposit.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td>${deposit.utr}</td>
                <td>${new Date(deposit.timestamp).toLocaleString()}</td>
                <td><span class="status-badge ${deposit.status}">${deposit.status.toUpperCase()}</span></td>
                <td>
                    <div class="action-btns">
                        ${deposit.status === 'pending' ? `
                            <button class="btn-approve" onclick="approveDeposit('${deposit.id}', '${deposit.userId}', ${deposit.amount})">Approve</button>
                            <button class="btn-reject" onclick="rejectDeposit('${deposit.id}')">Reject</button>
                        ` : '-'}
                    </div>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading deposits:', error);
    }
}

// Load Settings
async function loadSettings() {
    try {
        const settingsDoc = await db.collection('appSettings').doc('config').get();
        if (settingsDoc.exists) {
            const settings = settingsDoc.data();
            document.getElementById('freezeAppToggle').checked = settings.isFrozen || false;
        }
        
        // Check active call
        const callDoc = await db.collection('activeGroupCall').doc('current').get();
        if (callDoc.exists && callDoc.data().status === 'active') {
            document.getElementById('activeCallStatus').textContent = 'Call in progress';
            document.getElementById('endCallBtn').disabled = false;
        } else {
            document.getElementById('activeCallStatus').textContent = 'No active call';
            document.getElementById('endCallBtn').disabled = true;
        }
        
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// User Actions
async function banUser(userId) {
    if (!confirm('Are you sure you want to ban this user?')) return;
    
    try {
        await db.collection('users').doc(userId).update({ status: 'banned' });
        loadUsers();
        loadDashboardData();
        alert('User banned successfully');
    } catch (error) {
        console.error('Error banning user:', error);
        alert('Failed to ban user');
    }
}

async function unbanUser(userId) {
    if (!confirm('Are you sure you want to unban this user?')) return;
    
    try {
        await db.collection('users').doc(userId).update({ status: 'active' });
        loadUsers();
        loadDashboardData();
        alert('User unbanned successfully');
    } catch (error) {
        console.error('Error unbanning user:', error);
        alert('Failed to unban user');
    }
}

// Delete User Function
async function deleteUser(userId) {
    if (!confirm(`⚠️ WARNING!\n\nAre you sure you want to PERMANENTLY DELETE user "${userId}"?\n\nThis action CANNOT be undone and will delete all user data including:\n- User profile\n- Received entries\n- Deposit entries\n- Call history\n\nType "DELETE" to confirm:`)) return;
    
    const confirmation = prompt(`To confirm deletion, type "DELETE ${userId}" below:`);
    if (confirmation !== `DELETE ${userId}`) {
        alert('Deletion cancelled. User was not deleted.');
        return;
    }
    
    try {
        // Delete user's received entries
        const receivedSnapshot = await db.collection('receivedEntries')
            .where('userId', '==', userId)
            .get();
        const batch = db.batch();
        receivedSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        // Delete user's deposit entries
        const depositsSnapshot = await db.collection('depositEntries')
            .where('userId', '==', userId)
            .get();
        depositsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        // Delete user document
        batch.delete(db.collection('users').doc(userId));
        
        await batch.commit();
        
        loadUsers();
        loadDashboardData();
        alert(`✅ User "${userId}" and all associated data have been permanently deleted.`);
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('❌ Failed to delete user: ' + error.message);
    }
}

// Delete Received Entry Function
async function deleteReceivedEntry(entryId) {
    if (!confirm('Are you sure you want to delete this received entry?')) return;
    
    try {
        await db.collection('receivedEntries').doc(entryId).delete();
        loadReceivedEntries();
        alert('✅ Received entry deleted successfully');
    } catch (error) {
        console.error('Error deleting received entry:', error);
        alert('❌ Failed to delete received entry: ' + error.message);
    }
}

// Deposit Actions with Validation
async function approveDeposit(depositId, userId, amount) {
    if (!confirm(`Approve this deposit? ₹${amount.toLocaleString('en-IN', {minimumFractionDigits: 2})} will be deducted from user's wallet.`)) return;
    
    try {
        // Get fresh user data
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            alert('User not found');
            return;
        }
        
        const userData = userDoc.data();
        const currentBalance = userData.balance || 0;
        
        // VALIDATION: Check sufficient balance
        if (currentBalance < amount) {
            alert(`❌ Insufficient Balance!\n\nUser: ${userData.userId || userId}\nAvailable: ₹${currentBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}\nRequired: ₹${amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}\n\nCannot approve this deposit.`);
            return;
        }
        
        // VALIDATION: Check if deposit is still pending
        const depositDoc = await db.collection('depositEntries').doc(depositId).get();
        if (!depositDoc.exists) {
            alert('Deposit request not found');
            return;
        }
        
        const depositData = depositDoc.data();
        if (depositData.status !== 'pending') {
            alert(`This deposit has already been ${depositData.status}`);
            return;
        }
        
        const newBalance = currentBalance - amount;
        
        // Use batch write for atomic transaction
        const batch = db.batch();
        
        // Update deposit status
        batch.update(db.collection('depositEntries').doc(depositId), {
            status: 'approved',
            approvedAt: Date.now(),
            approvedBy: currentAdmin.id,
            previousBalance: currentBalance,
            newBalance: newBalance
        });
        
        // Deduct balance from user wallet
        batch.update(db.collection('users').doc(userId), {
            balance: newBalance,
            lastDepositDeduction: Date.now()
        });
        
        await batch.commit();
        
        // Refresh data
        loadDeposits();
        loadDashboardData();
        
        alert(`✅ Deposit Approved!\n\nAmount Deducted: ₹${amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}\nNew Balance: ₹${newBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
        
    } catch (error) {
        console.error('Error approving deposit:', error);
        alert('❌ Failed to approve deposit: ' + error.message);
    }
}

async function rejectDeposit(depositId) {
    if (!confirm('Reject this deposit? The user\'s wallet balance will NOT be changed.')) return;
    
    try {
        // Check if deposit is still pending
        const depositDoc = await db.collection('depositEntries').doc(depositId).get();
        if (!depositDoc.exists) {
            alert('Deposit request not found');
            return;
        }
        
        const depositData = depositDoc.data();
        if (depositData.status !== 'pending') {
            alert(`This deposit has already been ${depositData.status}`);
            return;
        }
        
        await db.collection('depositEntries').doc(depositId).update({
            status: 'rejected',
            rejectedAt: Date.now(),
            rejectedBy: currentAdmin.id
        });
        
        loadDeposits();
        alert('✅ Deposit rejected. No balance was deducted.');
    } catch (error) {
        console.error('Error rejecting deposit:', error);
        alert('❌ Failed to reject deposit: ' + error.message);
    }
}

// Create User
function createUser() {
    createUserModal.classList.remove('hidden');
}

function closeModal() {
    createUserModal.classList.add('hidden');
    createUserForm.reset();
}

// Reset Password Functions
const resetPasswordModal = document.getElementById('resetPasswordModal');
const resetPasswordForm = document.getElementById('resetPasswordForm');

function openResetModal(userId) {
    document.getElementById('resetUserId').value = userId;
    resetPasswordModal.classList.remove('hidden');
}

function closeResetModal() {
    resetPasswordModal.classList.add('hidden');
    resetPasswordForm.reset();
}

resetPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('resetUserId').value;
    const newPassword = document.getElementById('newResetPassword').value;
    const newMPIN = document.getElementById('newResetMPIN').value;
    
    // Validate MPIN is 4 digits
    if (!/^\d{4}$/.test(newMPIN)) {
        alert('MPIN must be exactly 4 digits');
        return;
    }
    
    if (!confirm(`Are you sure you want to reset password and MPIN for user "${userId}"?`)) return;
    
    try {
        // Hash the new password and MPIN
        const passwordHash = await hashString(newPassword);
        const mpinHash = await hashString(newMPIN);
        
        // Update user document
        await db.collection('users').doc(userId).update({
            passwordHash: passwordHash,
            mpinHash: mpinHash
        });
        
        closeResetModal();
        loadUsers();
        alert(`Password and MPIN reset successfully for user "${userId}"\n\nNew Password: ${newPassword}\nNew MPIN: ${newMPIN}`);
        
    } catch (error) {
        console.error('Error resetting password:', error);
        alert('Failed to reset password');
    }
});

// Close reset modal on outside click
resetPasswordModal.addEventListener('click', (e) => {
    if (e.target === resetPasswordModal) {
        closeResetModal();
    }
});

createUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('newUserId').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const balance = parseFloat(document.getElementById('newUserBalance').value) || 0;
    
    try {
        // Check if user exists
        const existingUser = await db.collection('users').doc(userId).get();
        if (existingUser.exists) {
            alert('User ID already exists');
            return;
        }
        
        // Create user
        await db.collection('users').doc(userId).set({
            userId: userId,
            passwordHash: await hashString(password),
            balance: balance,
            status: 'active',
            createdAt: Date.now(),
            lastLogin: null
        });
        
        closeModal();
        loadUsers();
        loadDashboardData();
        alert('User created successfully');
        
    } catch (error) {
        console.error('Error creating user:', error);
        alert('Failed to create user');
    }
});

// Edit User Modal Functions
const editUserModal = document.getElementById('editUserModal');
const editUserForm = document.getElementById('editUserForm');

function openEditUserModal(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUserEmail').value = user.email || '';
    document.getElementById('editUserBalance').value = user.balance || 0;
    document.getElementById('editUserStatus').value = user.status || 'active';
    
    editUserModal.classList.remove('hidden');
}

function closeEditModal() {
    editUserModal.classList.add('hidden');
    editUserForm.reset();
}

editUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('editUserId').value;
    const email = document.getElementById('editUserEmail').value.trim();
    const balance = parseFloat(document.getElementById('editUserBalance').value) || 0;
    const status = document.getElementById('editUserStatus').value;
    
    if (!confirm(`Are you sure you want to update user "${userId}"?`)) return;
    
    try {
        await db.collection('users').doc(userId).update({
            email: email,
            balance: balance,
            status: status,
            lastUpdated: Date.now()
        });
        
        closeEditModal();
        loadUsers();
        loadDashboardData();
        alert(`✅ User "${userId}" updated successfully`);
        
    } catch (error) {
        console.error('Error updating user:', error);
        alert('❌ Failed to update user: ' + error.message);
    }
});

// Close edit modal on outside click
editUserModal.addEventListener('click', (e) => {
    if (e.target === editUserModal) {
        closeEditModal();
    }
});

// Settings Actions
document.getElementById('freezeAppToggle').addEventListener('change', async (e) => {
    try {
        await db.collection('appSettings').doc('config').set({
            isFrozen: e.target.checked
        }, { merge: true });
        
        alert(e.target.checked ? 'App frozen successfully' : 'App unfrozen');
    } catch (error) {
        console.error('Error updating settings:', error);
        alert('Failed to update settings');
    }
});

document.getElementById('endCallBtn').addEventListener('click', async () => {
    if (!confirm('End the active call?')) return;
    
    try {
        // Get all participants
        const participantsSnapshot = await db.collection('callParticipants').get();
        const batch = db.batch();
        
        participantsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        // Update call status
        batch.update(db.collection('activeGroupCall').doc('current'), {
            status: 'inactive',
            participantsCount: 0
        });
        
        await batch.commit();
        
        loadSettings();
        alert('Call ended');
    } catch (error) {
        console.error('Error ending call:', error);
        alert('Failed to end call');
    }
});

// User search - Updated to search by email
document.getElementById('userSearch').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#usersTableBody tr');
    
    rows.forEach(row => {
        const email = row.cells[0].textContent.toLowerCase();
        row.style.display = email.includes(searchTerm) ? '' : 'none';
    });
});

// Close modal on outside click
createUserModal.addEventListener('click', (e) => {
    if (e.target === createUserModal) {
        closeModal();
    }
});

// Sidebar functions
function openSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.classList.add('open');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
}

// User Detail Page Functions - Updated to show email instead of UID
async function viewUser(userId) {
    try {
        const user = users.find(u => u.id === userId);
        if (!user) return;
        
        // Update user detail page
        document.getElementById('userDetailTitle').textContent = `User: ${user.email || 'No Email'}`;
        document.getElementById('detailUserEmail').textContent = user.email || 'N/A';
        document.getElementById('detailUserBalance').textContent = '₹' + (user.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
        document.getElementById('detailUserStatus').innerHTML = `<span class="status-badge ${user.status || 'active'}">${user.status || 'Active'}</span>`;
        document.getElementById('detailUserLastLogin').textContent = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never';
        
        // Load received history
        await loadUserReceivedHistory(userId);
        
        // Load deposit history
        await loadUserDepositHistory(userId);
        
        // Navigate to user detail page
        // Hide all pages
        pages.forEach(p => p.classList.add('hidden'));
        
        // Show user-detail page
        document.getElementById('page-user-detail').classList.remove('hidden');
        
        // Update page title
        document.getElementById('pageTitle').textContent = 'User Details';
        
    } catch (error) {
        console.error('Error viewing user:', error);
    }
}

async function loadUserReceivedHistory(userId) {
    try {
        const receivedSnapshot = await db.collection('receivedEntries')
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc')
            .get();
        
        const received = receivedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const tbody = document.getElementById('receivedHistoryBody');
        tbody.innerHTML = received.length > 0 
            ? received.map(entry => `
                <tr>
                    <td>₹${entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td>${entry.note || entry.description || '-'}</td>
                    <td>${new Date(entry.timestamp).toLocaleString()}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="3" class="empty-state">No received entries</td></tr>';
    } catch (error) {
        console.error('Error loading received history:', error);
    }
}

async function loadUserDepositHistory(userId) {
    try {
        const depositsSnapshot = await db.collection('depositEntries')
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc')
            .get();
        
        const userDeposits = depositsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const tbody = document.getElementById('depositHistoryBody');
        tbody.innerHTML = userDeposits.length > 0 
            ? userDeposits.map(deposit => `
                <tr>
                    <td>₹${deposit.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td>${deposit.utr}</td>
                    <td>${deposit.note || deposit.description || '-'}</td>
                    <td><span class="status-badge ${deposit.status}">${deposit.status.toUpperCase()}</span></td>
                    <td>${new Date(deposit.timestamp).toLocaleString()}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="5" class="empty-state">No deposit entries</td></tr>';
    } catch (error) {
        console.error('Error loading deposit history:', error);
    }
}

// Received Entries Page - Updated to show email instead of userId
async function loadReceivedEntries() {
    try {
        const receivedSnapshot = await db.collection('receivedEntries')
            .orderBy('timestamp', 'desc')
            .get();
        
        receivedEntries = receivedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Get user emails for display
        const userEmails = {};
        for (const entry of receivedEntries) {
            if (entry.userId && !userEmails[entry.userId]) {
                const userDoc = await db.collection('users').doc(entry.userId).get();
                userEmails[entry.userId] = userDoc.exists ? userDoc.data().email : entry.userId;
            }
        }
        
        const tbody = document.getElementById('receivedTableBody');
        tbody.innerHTML = receivedEntries.map(entry => `
            <tr>
                <td>${userEmails[entry.userId] || entry.userId}</td>
                <td>₹${entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td>${new Date(entry.timestamp).toLocaleString()}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-delete" onclick="deleteReceivedEntry('${entry.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading received entries:', error);
    }
}

// Recent Activity Listeners
function setupActivityListeners() {
    // Clean up existing listeners
    activityListeners.forEach(unsubscribe => unsubscribe());
    activityListeners = [];
    
    const activities = [];
    
    // Listen for new users
    const usersListener = db.collection('users')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (data.createdAt) {
                        activities.push({
                            type: 'user-created',
                            userId: data.userId,
                            timestamp: data.createdAt,
                            display: 'User created'
                        });
                    }
                }
            });
            updateActivityList(activities);
        });
    activityListeners.push(usersListener);
    
    // Listen for received entries
    const receivedListener = db.collection('receivedEntries')
        .orderBy('timestamp', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    activities.push({
                        type: 'received-entry',
                        userId: data.userId,
                        amount: data.amount,
                        timestamp: data.timestamp,
                        display: 'Received entry added'
                    });
                }
            });
            updateActivityList(activities);
        });
    activityListeners.push(receivedListener);
    
    // Listen for deposit entries
    const depositsListener = db.collection('depositEntries')
        .orderBy('timestamp', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added' || change.type === 'modified') {
                    const data = change.doc.data();
                    const isNew = change.type === 'added';
                    
                    if (isNew) {
                        activities.push({
                            type: 'deposit-created',
                            userId: data.userId,
                            amount: data.amount,
                            timestamp: data.timestamp,
                            display: 'Deposit request created'
                        });
                    } else if (data.status === 'approved') {
                        activities.push({
                            type: 'deposit-approved',
                            userId: data.userId,
                            amount: data.amount,
                            timestamp: Date.now(),
                            display: 'Deposit approved'
                        });
                    } else if (data.status === 'rejected') {
                        activities.push({
                            type: 'deposit-rejected',
                            userId: data.userId,
                            amount: data.amount,
                            timestamp: Date.now(),
                            display: 'Deposit rejected'
                        });
                    }
                }
            });
            updateActivityList(activities);
        });
    activityListeners.push(depositsListener);
}

function updateActivityList(activities) {
    // Sort by timestamp (newest first) and limit to 20
    const sortedActivities = activities
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);
    
    const container = document.getElementById('recentActivity');
    
    if (sortedActivities.length === 0) {
        container.innerHTML = '<p class="empty-state">No recent activity</p>';
        return;
    }
    
    const getActivityIcon = (type) => {
        switch (type) {
            case 'user-created': return '👤';
            case 'received-entry': return '📥';
            case 'deposit-created': return '💰';
            case 'deposit-approved': return '✅';
            case 'deposit-rejected': return '❌';
            default: return '📋';
        }
    };
    
    // Helper to get user email from users array
    const getUserDisplay = (userId) => {
        const user = users.find(u => u.id === userId || u.userId === userId || u.uid === userId);
        return user?.email || userId;
    };
    
    container.innerHTML = sortedActivities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon ${activity.type}">${getActivityIcon(activity.type)}</div>
            <div class="activity-content">
                <div class="activity-title">${activity.display}</div>
                <div class="activity-meta">User: ${getUserDisplay(activity.userId)} • ${new Date(activity.timestamp).toLocaleString()}</div>
            </div>
            ${activity.amount ? `<div class="activity-amount">₹${activity.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>` : ''}
        </div>
    `).join('');
}

// Initialize - real-time listeners for dashboard activity
console.log('Admin panel initialized');

// ============================================
// ADD RECEIVED ENTRY MODAL FUNCTIONS
// ============================================

// Open Add Received Entry Modal
let allUsersForReceived = []; // Store users for filtering

async function openAddReceivedModal() {
    // Populate user dropdown
    const select = document.getElementById('receivedUserSelect');
    const searchInput = document.getElementById('receivedUserSearch');
    select.innerHTML = '<option value="">Select a user...</option>';
    searchInput.value = ''; // Clear search
    
    try {
        // Get all active users
        const usersSnapshot = await db.collection('users')
            .where('status', '==', 'active')
            .get();
        
        allUsersForReceived = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        populateUserDropdown(allUsersForReceived);
        
        // Add search listener
        searchInput.oninput = (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            if (searchTerm === '') {
                populateUserDropdown(allUsersForReceived);
            } else {
                const filtered = allUsersForReceived.filter(user => {
                    const email = (user.email || '').toLowerCase();
                    const name = (user.name || '').toLowerCase();
                    return email.includes(searchTerm) || name.includes(searchTerm);
                });
                populateUserDropdown(filtered);
            }
        };
        
        addReceivedModal.classList.remove('hidden');
    } catch (error) {
        console.error('Error loading users for dropdown:', error);
        alert('Failed to load users. Please try again.');
    }
}

// Helper to populate dropdown
function populateUserDropdown(usersList) {
    const select = document.getElementById('receivedUserSelect');
    select.innerHTML = '<option value="">Select a user...</option>';
    
    usersList.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id; // Store uid as value
        option.textContent = `${user.email || 'No Email'} (Balance: ₹${(user.balance || 0).toLocaleString('en-IN')})`;
        select.appendChild(option);
    });
}

// Close Add Received Entry Modal
function closeAddReceivedModal() {
    addReceivedModal.classList.add('hidden');
    addReceivedForm.reset();
}

// Close modal on outside click
addReceivedModal.addEventListener('click', (e) => {
    if (e.target === addReceivedModal) {
        closeAddReceivedModal();
    }
});

// Handle Add Received Entry Form Submission
addReceivedForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('receivedUserSelect').value;
    const amount = parseFloat(document.getElementById('receivedAmount').value);
    const note = document.getElementById('receivedNote').value.trim();
    
    if (!userId) {
        alert('Please select a user');
        return;
    }
    
    if (!amount || amount <= 0) {
        alert('Please enter a valid amount greater than 0');
        return;
    }
    
    try {
        // Get user data to retrieve email
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            alert('User not found');
            return;
        }
        
        const userData = userDoc.data();
        const userEmail = userData.email || 'N/A';
        const currentBalance = userData.balance || 0;
        const newBalance = currentBalance + amount;
        
        // Use batch write for atomic transaction
        const batch = db.batch();
        
        // Create received entry document
        const entryRef = db.collection('receivedEntries').doc();
        batch.set(entryRef, {
            userId: userId,
            userEmail: userEmail,
            amount: amount,
            note: note || '',
            timestamp: Date.now(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentAdmin.id,
            type: 'received'
        });
        
        // Update user wallet balance
        batch.update(db.collection('users').doc(userId), {
            balance: newBalance,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();
        
        closeAddReceivedModal();
        loadReceivedEntries();
        loadDashboardData();
        
        alert(`✅ Received Entry Created!\n\nUser: ${userEmail}\nAmount Added: ₹${amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}\nNew Balance: ₹${newBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
        
    } catch (error) {
        console.error('Error creating received entry:', error);
        alert('❌ Failed to create received entry: ' + error.message);
    }
});
