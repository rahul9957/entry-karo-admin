// ============================================
// Entry Karo Admin Panel - Complete JavaScript
// Modern, Mobile-First Admin Dashboard
// ============================================

// Firebase Configuration
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
const auth = firebase.auth();

// ============================================
// GLOBAL STATE
// ============================================
let currentAdmin = null;
let users = [];
let deposits = [];
let receivedEntries = [];
let currentUserDetail = null;
let activityListeners = [];
let allUsersForReceived = [];

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Escape HTML / JS strings safely
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, "\\'");
}

// Get User Name and Email by UID
function getUserDetails(uid, fallbackName = '', fallbackEmail = '') {
    if (!uid) return { name: fallbackName || 'User', email: fallbackEmail || '-' };
    
    if (typeof users !== 'undefined' && users && users.length > 0) {
        const userObj = users.find(u => u.id === uid || u.uid === uid || u.userId === uid);
        if (userObj) {
            const name = userObj.displayName || userObj.name || userObj.fullName || fallbackName || 'User';
            const email = userObj.email || fallbackEmail || uid;
            return { name, email };
        }
    }
    
    if (typeof subscriptionRequests !== 'undefined' && subscriptionRequests && subscriptionRequests.length > 0) {
        const reqObj = subscriptionRequests.find(r => r.uid === uid);
        if (reqObj) {
            const name = reqObj.name || fallbackName || 'User';
            const email = reqObj.email || fallbackEmail || uid;
            return { name, email };
        }
    }
    
    return { name: fallbackName || 'User', email: fallbackEmail || uid };
}

// SHA-256 Hash Function
async function hashString(str) {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Format currency
function formatCurrency(amount) {
    return '₹' + (amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format date
function formatDate(timestamp) {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Toast Notifications
function showToast(type, title, message, duration = 4000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
        </button>
    `;
    
    container.appendChild(toast);
    
    if (duration > 0) {
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    
    return toast;
}

// ============================================
// AUTHENTICATION
// ============================================

// Login Form Handler
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    errorDiv.textContent = '';
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        // Step 1: Authenticate with Firebase Auth
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;
        
        // Step 2: Verify admin exists in Firestore
        const adminDoc = await db.collection('admins').doc(uid).get();
        
        if (!adminDoc.exists) {
            await auth.signOut();
            errorDiv.textContent = 'Access denied. Not an authorized admin.';
            return;
        }
        
        const adminData = adminDoc.data();
        currentAdmin = { id: uid, email: email, ...adminData };
        
        showDashboard();
        loadDashboardData();
        showToast('success', 'Welcome Back!', `Logged in as ${email}`);
        
    } catch (error) {
        console.error('Login error:', error);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorDiv.textContent = 'Invalid email or password';
        } else if (error.code === 'auth/invalid-email') {
            errorDiv.textContent = 'Invalid email format';
        } else if (error.code === 'auth/invalid-credential') {
            errorDiv.textContent = 'Invalid credentials. Please try again.';
        } else {
            errorDiv.textContent = 'Login failed. Please try again.';
        }
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
});

// Toggle Password Visibility
document.getElementById('togglePassword')?.addEventListener('click', () => {
    const input = document.getElementById('adminPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
});

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try {
        await auth.signOut();
        cleanupListeners();
        currentAdmin = null;
        showLogin();
        showToast('success', 'Logged Out', 'You have been successfully logged out.');
    } catch (e) {
        console.error('Logout error:', e);
        showToast('error', 'Error', 'Failed to logout. Please try again.');
    }
});

// Auth State Listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Verify admin status
        const adminDoc = await db.collection('admins').doc(user.uid).get();
        if (adminDoc.exists) {
            currentAdmin = { id: user.uid, email: user.email, ...adminDoc.data() };
            showDashboard();
            loadDashboardData();
        } else {
            await auth.signOut();
        }
    } else {
        showLogin();
    }
});

// ============================================
// NAVIGATION
// ============================================

// Navigation Items
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        navigateTo(page);
    });
});

function navigateTo(page) {
    console.log('navigateTo called:', page);
    
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    
    // Hide all pages - remove both active and hidden classes first
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.classList.add('hidden');
    });
    
    // Show selected page - remove hidden and add active
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) {
        targetPage.classList.remove('hidden');
        targetPage.classList.add('active');
        console.log('Page shown:', page, {
            id: targetPage.id,
            classList: Array.from(targetPage.classList),
            displayStyle: targetPage.style.display,
            computedDisplay: getComputedStyle(targetPage).display,
            childrenCount: targetPage.children.length,
            innerHTML_Length: targetPage.innerHTML.length
        });
    } else {
        console.error('Page not found:', `page-${page}`);
    }
    
    // Update page titles
    const titles = {
        'dashboard': 'Dashboard',
        'approvals': 'User Approvals',
        'users': 'User Management',
        'user-detail': 'User Profile',
        'received': 'Received Entries',
        'deposits': 'Deposit Approvals',
        'employees': 'Employee Management',
        'id-statements': 'ID Management',
        'subscriptions': 'Subscription Management',
        'self-transfers': 'Self Transfer Management',
        'app-update': 'App Update Management',
        'settings': 'Settings'
    };
    
    const title = titles[page] || 'Dashboard';
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('mobilePageTitle').textContent = title;
    document.getElementById('headerSubtitle').textContent = getSubtitle(page);
    
    // Load page data
    loadPageData(page);
    
    // Close mobile sidebar
    closeSidebar();
}

function getSubtitle(page) {
    const subtitles = {
        'dashboard': "Welcome back! Here's what's happening today.",
        'approvals': 'Review and approve pending user registrations.',
        'users': 'Manage user accounts, balances, and permissions.',
        'user-detail': 'View detailed user information and transaction history.',
        'received': 'Create and manage received entries for users.',
        'deposits': 'Review and process deposit requests.',
        'employees': 'Manage employee accounts, permissions, and panel access.',
        'id-statements': 'View ID 1 and ID 2 statements and export history.',
        'subscriptions': 'Review payments, manage active subscriptions, set plans & UPI details.',
        'self-transfers': 'Review, approve, or reject user-to-user wallet transfer requests.',
        'app-update': 'Manage Android release versions, download URLs, update messages, and force updates.',
        'settings': 'Configure global app settings and controls.'
    };
    return subtitles[page] || '';
}

function loadPageData(page) {
    switch(page) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'approvals':
            loadUserApprovals();
            break;
        case 'users':
            loadUsers();
            break;
        case 'deposits':
            loadDeposits();
            break;
        case 'received':
            loadReceivedEntries();
            break;
        case 'employees':
            loadEmployees();
            break;
        case 'id-statements':
            loadIdStatements();
            break;
        case 'subscriptions':
            loadSubscriptionsData();
            break;
        case 'self-transfers':
            loadSelfTransfersData();
            break;
        case 'app-update':
            loadAppUpdateData();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// Mobile Sidebar
function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

document.getElementById('menuBtn')?.addEventListener('click', openSidebar);
document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

// ============================================
// VIEW MANAGEMENT
// ============================================

function showDashboard() {
    console.log('showDashboard called');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.remove('hidden');
    
    // Ensure dashboard page is visible
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.classList.add('hidden');
    });
    document.getElementById('page-dashboard')?.classList.remove('hidden');
    document.getElementById('page-dashboard')?.classList.add('active');
    
    // Update admin info in sidebar
    if (currentAdmin) {
        document.getElementById('adminName').textContent = currentAdmin.email?.split('@')[0] || 'Admin';
        document.getElementById('adminInitials').textContent = (currentAdmin.email?.[0] || 'A').toUpperCase();
    }
}

function showLogin() {
    console.log('showLogin called');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboardScreen').classList.add('hidden');
    document.getElementById('loginForm').reset();
    cleanupListeners();
}

// ============================================
// DASHBOARD
// ============================================

async function loadDashboardData() {
    try {
        // Get total users
        const usersSnapshot = await db.collection('users').get();
        users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        document.getElementById('totalUsers').textContent = users.length;
        document.getElementById('actionUserCount').textContent = `${users.length} users`;
        
        // Calculate total balance
        const totalBalance = users.reduce((sum, user) => sum + (user.balance || 0), 0);
        document.getElementById('totalBalance').textContent = formatCurrency(totalBalance);
        
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
        const pendingCount = deposits.length;
        document.getElementById('pendingDeposits').textContent = pendingCount;
        document.getElementById('actionDepositCount').textContent = `${pendingCount} pending`;
        
        // Update badges
        document.getElementById('approvalBadge').textContent = users.filter(u => u.status === 'pending').length;
        document.getElementById('depositBadge').textContent = pendingCount;
        document.getElementById('notificationBadge').textContent = pendingCount;
        
        // Setup real-time listeners
        setupActivityListeners();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('error', 'Error', 'Failed to load dashboard data');
    }
}

function refreshActivity() {
    setupActivityListeners();
    showToast('success', 'Refreshed', 'Activity list updated');
}

// ============================================
// ACTIVITY LISTENERS
// ============================================

function setupActivityListeners() {
    // Clean up existing listeners
    cleanupListeners();
    
    const activities = [];
    const container = document.getElementById('recentActivity');
    
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
                            userId: data.userId || change.doc.id,
                            timestamp: data.createdAt,
                            display: 'New user registered'
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
                        display: 'Received entry created'
                    });
                }
            });
            updateActivityList(activities);
        });
    activityListeners.push(receivedListener);
    
    // Listen for deposits
    const depositsListener = db.collection('depositEntries')
        .orderBy('timestamp', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                const data = change.doc.data();
                if (change.type === 'added') {
                    activities.push({
                        type: 'deposit-created',
                        userId: data.userId,
                        amount: data.amount,
                        timestamp: data.timestamp,
                        display: 'Deposit request created'
                    });
                } else if (change.type === 'modified') {
                    if (data.status === 'approved') {
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
    const sorted = activities
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);
    
    const container = document.getElementById('recentActivity');
    
    if (sorted.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
                    </svg>
                </div>
                <p>No recent activity</p>
            </div>
        `;
        return;
    }
    
    const getIcon = (type) => {
        const icons = {
            'user-created': '👤',
            'received-entry': '📥',
            'deposit-created': '💰',
            'deposit-approved': '✅',
            'deposit-rejected': '❌'
        };
        return icons[type] || '📋';
    };
    
    const getUserDisplay = (userId) => {
        const user = users.find(u => u.id === userId || u.userId === userId);
        return user?.email || user?.userId || userId.substring(0, 8) + '...';
    };
    
    container.innerHTML = sorted.map(activity => `
        <div class="activity-item">
            <div class="activity-icon ${activity.type}">${getIcon(activity.type)}</div>
            <div class="activity-content">
                <div class="activity-title">${activity.display}</div>
                <div class="activity-meta">${getUserDisplay(activity.userId)} • ${formatDate(activity.timestamp)}</div>
            </div>
            ${activity.amount ? `<div class="activity-amount">${formatCurrency(activity.amount)}</div>` : ''}
        </div>
    `).join('');
}

function cleanupListeners() {
    activityListeners.forEach(unsubscribe => unsubscribe());
    activityListeners = [];
}

// ============================================
// USER APPROVALS
// ============================================

async function loadUserApprovals() {
    console.log('loadUserApprovals() called');
    try {
        const snapshot = await db.collection('users')
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .get();
        
        console.log('Pending approvals loaded:', snapshot.docs.length);
        
        const pendingUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const tbody = document.getElementById('approvalsTableBody');
        const noDataMsg = document.getElementById('noApprovalsMessage');
        
        if (!tbody) {
            console.error('approvalsTableBody not found!');
            return;
        }
        
        if (pendingUsers.length === 0) {
            tbody.innerHTML = '';
            noDataMsg.classList.remove('hidden');
            return;
        }
        
        noDataMsg.classList.add('hidden');
        tbody.innerHTML = pendingUsers.map(user => `
            <tr>
                <td>${user.email || 'N/A'}</td>
                <td><code>${user.userId || user.id}</code></td>
                <td>${formatDate(user.createdAt)}</td>
                <td class="actions-col">
                    <div class="action-btns">
                        <button class="btn-icon approve" onclick="approveUser('${user.id}')" title="Approve">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                            </svg>
                        </button>
                        <button class="btn-icon delete" onclick="rejectUser('${user.id}')" title="Reject">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading approvals:', error);
        showToast('error', 'Error', 'Failed to load pending approvals');
    }
}

async function approveUser(userId) {
    if (!confirm('Are you sure you want to approve this user?')) return;
    
    try {
        await db.collection('users').doc(userId).update({
            status: 'active',
            approvedAt: Date.now(),
            approvedBy: currentAdmin.id
        });
        
        showToast('success', 'User Approved', 'User has been successfully approved');
        loadUserApprovals();
        loadUsers();
        loadDashboardData();
    } catch (error) {
        console.error('Error approving user:', error);
        showToast('error', 'Error', 'Failed to approve user');
    }
}

async function rejectUser(userId) {
    if (!confirm('Are you sure you want to reject this user? They will be banned.')) return;
    
    try {
        await db.collection('users').doc(userId).update({
            status: 'banned',
            rejectedAt: Date.now(),
            rejectedBy: currentAdmin.id
        });
        
        showToast('warning', 'User Rejected', 'User has been banned');
        loadUserApprovals();
        loadUsers();
    } catch (error) {
        console.error('Error rejecting user:', error);
        showToast('error', 'Error', 'Failed to reject user');
    }
}

// ============================================
// USER MANAGEMENT
// ============================================

async function loadUsers() {
    console.log('loadUsers() called');
    try {
        const snapshot = await db.collection('users').get();
        console.log('Users loaded:', snapshot.docs.length);
        users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        renderUsersTable(users);
    } catch (error) {
        console.error('Error loading users:', error);
        showToast('error', 'Error', 'Failed to load users: ' + error.message);
    }
}

function renderUsersTable(usersList) {
    const tbody = document.getElementById('usersTableBody');
    console.log('renderUsersTable called with', usersList.length, 'users');
    
    if (!tbody) {
        console.error('usersTableBody not found!');
        return;
    }
    
    if (usersList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No users found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = usersList.map(user => `
        <tr onclick="viewUser('${user.id}')" style="cursor: pointer;">
            <td>${user.email || 'N/A'}</td>
            <td><span class="status-badge ${user.idType === 'ID2' ? 'id2-badge' : 'id1-badge'}">${user.idType || 'ID1'}</span></td>
            <td>${formatCurrency(user.balance)}</td>
            <td><span class="status-badge ${user.status || 'active'}">${user.status || 'Active'}</span></td>
            <td>${formatDate(user.lastLogin)}</td>
            <td class="actions-col" onclick="event.stopPropagation()">
                <div class="action-btns">
                    <button class="btn-icon view" onclick="viewUser('${user.id}')" title="View">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 9c-1.38 0-2.5-1.12-2.5-2.5S10.62 8.5 12 8.5s2.5 1.12 2.5 2.5S13.38 13.5 12 13.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon edit" onclick="openEditUserModal('${user.id}')" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                    ${user.status === 'pending' 
                        ? `<button class="btn-icon approve" onclick="approveUser('${user.id}')" title="Approve">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                            </svg>
                        </button>`
                        : ''}
                    ${user.status === 'banned'
                        ? `<button class="btn-icon approve" onclick="unbanUser('${user.id}')" title="Unban">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                            </svg>
                        </button>`
                        : `<button class="btn-icon delete" onclick="banUser('${user.id}')" title="Ban">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/>
                            </svg>
                        </button>`
                    }
                    <button class="btn-icon delete" onclick="deleteUser('${user.id}')" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// User Search
document.getElementById('userSearch')?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    const statusFilter = document.getElementById('userStatusFilter')?.value || 'all';
    const idTypeFilter = document.getElementById('userIdTypeFilter')?.value || 'all';
    
    let filtered = users;
    
    if (searchTerm) {
        filtered = filtered.filter(user => 
            (user.email || '').toLowerCase().includes(searchTerm) ||
            (user.userId || '').toLowerCase().includes(searchTerm)
        );
    }
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(user => user.status === statusFilter);
    }
    
    if (idTypeFilter !== 'all') {
        filtered = filtered.filter(user => (user.idType || 'ID1') === idTypeFilter);
    }
    
    renderUsersTable(filtered);
});

document.getElementById('userStatusFilter')?.addEventListener('change', () => {
    document.getElementById('userSearch')?.dispatchEvent(new Event('input'));
});

document.getElementById('userIdTypeFilter')?.addEventListener('change', () => {
    document.getElementById('userSearch')?.dispatchEvent(new Event('input'));
});

// User Actions
async function banUser(userId) {
    if (!confirm('Are you sure you want to ban this user?')) return;
    
    try {
        await db.collection('users').doc(userId).update({ status: 'banned' });
        showToast('warning', 'User Banned', 'User has been banned');
        loadUsers();
        loadDashboardData();
    } catch (error) {
        console.error('Error banning user:', error);
        showToast('error', 'Error', 'Failed to ban user');
    }
}

async function unbanUser(userId) {
    if (!confirm('Are you sure you want to unban this user?')) return;
    
    try {
        await db.collection('users').doc(userId).update({ status: 'active' });
        showToast('success', 'User Unbanned', 'User has been unbanned');
        loadUsers();
        loadDashboardData();
    } catch (error) {
        console.error('Error unbanning user:', error);
        showToast('error', 'Error', 'Failed to unban user');
    }
}

async function deleteUser(userId) {
    const confirmation1 = confirm(`⚠️ WARNING!\n\nAre you sure you want to PERMANENTLY DELETE this user?\n\nThis action CANNOT be undone and will delete all user data.`);
    if (!confirmation1) return;
    
    const confirmation2 = prompt(`To confirm deletion, type "DELETE ${userId}" below:`);
    if (confirmation2 !== `DELETE ${userId}`) {
        showToast('warning', 'Cancelled', 'User deletion cancelled');
        return;
    }
    
    try {
        const batch = db.batch();
        
        // Delete received entries
        const receivedSnapshot = await db.collection('receivedEntries')
            .where('userId', '==', userId)
            .get();
        receivedSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        
        // Delete deposit entries
        const depositsSnapshot = await db.collection('depositEntries')
            .where('userId', '==', userId)
            .get();
        depositsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        
        // Delete user
        batch.delete(db.collection('users').doc(userId));
        
        await batch.commit();
        
        showToast('success', 'User Deleted', 'User and all data have been permanently deleted');
        loadUsers();
        loadDashboardData();
    } catch (error) {
        console.error('Error deleting user:', error);
        showToast('error', 'Error', 'Failed to delete user: ' + error.message);
    }
}

// ============================================
// USER PROFILE / DETAIL PAGE
// ============================================

async function viewUser(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) {
        showToast('error', 'Error', 'User not found');
        return;
    }
    
    currentUserDetail = user;
    
    // Update profile header
    document.getElementById('userDetailTitle').textContent = user.email || 'User Profile';
    document.getElementById('detailUserName').textContent = user.userId || user.id;
    document.getElementById('detailUserEmail').textContent = user.email || 'N/A';
    document.getElementById('detailUserBalance').textContent = formatCurrency(user.balance);
    document.getElementById('detailUserStatus').textContent = user.status || 'Active';
    document.getElementById('detailUserStatus').className = `status-badge ${user.status || 'active'}`;
    document.getElementById('detailUserLastLogin').textContent = formatDate(user.lastLogin);
    document.getElementById('detailUserCreated').textContent = formatDate(user.createdAt);
    document.getElementById('detailUserAvatar').querySelector('span').textContent = (user.email?.[0] || 'U').toUpperCase();
    
    // Update ban button
    const banBtn = document.getElementById('detailBanBtn');
    if (banBtn) {
        banBtn.textContent = user.status === 'banned' ? 'Unban User' : 'Ban User';
        banBtn.onclick = user.status === 'banned' 
            ? () => unbanUser(user.id) 
            : () => banUser(user.id);
    }
    
    // Load transaction data
    await loadUserTransactionStatement(userId);
    await loadUserReceivedHistory(userId);
    await loadUserDepositHistory(userId);
    
    navigateTo('user-detail');
}

function formatStatementDescription(t) {
    let raw = t.description || t.note || t.remark || '';
    if (!raw && t.utr) raw = t.utr;
    
    const isDebit = t.transactionType === 'debit' || t.amount < 0 || t.type === 'deposit' || t.type === 'self_transfer_out';
    
    if (isDebit) {
        if (!raw) return `Deposit - ${t.utr || 'N/A'}`;
        
        if (raw.includes('Receiver:') || raw.includes('Transfer to') || raw.includes('Send to:')) {
            const emailMatch = raw.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            const email = emailMatch ? emailMatch[0] : '';
            
            let noteText = '';
            if (raw.includes('| Note:')) {
                noteText = raw.split('| Note:')[1] || '';
            } else if (raw.includes('Note:')) {
                noteText = raw.split('Note:')[1] || '';
            }
            
            let result = email ? `Send to: ${email}` : raw.replace(/Receiver:/gi, '').replace(/Transfer to/gi, 'Send to:').trim();
            if (noteText && noteText.trim() && !result.includes('| Note:')) {
                result += ` | Note: ${noteText.trim()}`;
            }
            return result;
        }
        
        return raw;
    } else {
        if (!raw) return 'Received Entry';
        
        if (raw.includes('Sender:') || raw.includes('Transfer from') || raw.includes('Receive from:')) {
            const emailMatch = raw.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            const email = emailMatch ? emailMatch[0] : '';
            
            let noteText = '';
            if (raw.includes('| Note:')) {
                noteText = raw.split('| Note:')[1] || '';
            } else if (raw.includes('Note:')) {
                noteText = raw.split('Note:')[1] || '';
            }
            
            let result = email ? `Receive from: ${email}` : raw.replace(/Sender:/gi, '').replace(/Transfer from/gi, 'Receive from:').trim();
            if (noteText && noteText.trim() && !result.includes('| Note:')) {
                result += ` | Note: ${noteText.trim()}`;
            }
            return result;
        }
        
        return raw;
    }
}

async function loadUserTransactionStatement(userId) {
    try {
        console.log('Loading transaction statement for:', userId);
        
        // Get user data first
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        console.log('User data loaded:', userData);
        
        // Get received entries (credits)
        let receivedData = [];
        try {
            const receivedSnapshot = await db.collection('receivedEntries')
                .where('userId', '==', userId)
                .orderBy('timestamp', 'desc')
                .get();
            receivedData = receivedSnapshot.docs.map(doc => ({ 
                id: doc.id, 
                type: 'received',
                ...doc.data() 
            }));
            console.log('Received entries:', receivedData.length);
        } catch (queryError) {
            console.error('Error loading received entries:', queryError);
            // Fallback: try without orderBy
            try {
                const fallbackSnapshot = await db.collection('receivedEntries')
                    .where('userId', '==', userId)
                    .get();
                receivedData = fallbackSnapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    type: 'received',
                    ...doc.data() 
                }));
                console.log('Received entries (fallback):', receivedData.length);
            } catch (e) {
                console.error('Fallback also failed:', e);
            }
        }
        
        // Get deposits (debits)
        let depositsData = [];
        try {
            const depositsSnapshot = await db.collection('depositEntries')
                .where('userId', '==', userId)
                .orderBy('timestamp', 'desc')
                .get();
            depositsData = depositsSnapshot.docs.map(doc => ({ 
                id: doc.id, 
                type: 'deposit',
                ...doc.data() 
            }));
            console.log('Deposit entries:', depositsData.length);
        } catch (queryError) {
            console.error('Error loading deposit entries:', queryError);
            // Fallback: try without orderBy
            try {
                const fallbackSnapshot = await db.collection('depositEntries')
                    .where('userId', '==', userId)
                    .get();
                depositsData = fallbackSnapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    type: 'deposit',
                    ...doc.data() 
                }));
                console.log('Deposit entries (fallback):', depositsData.length);
            } catch (e) {
                console.error('Fallback also failed:', e);
            }
        }
        
        // Combine and calculate totals - include ALL transactions (approved and pending)
        const allTransactions = [
            ...receivedData.map(r => ({ 
                ...r, 
                amount: r.amount, 
                transactionType: 'credit',
                status: 'completed',
                description: formatStatementDescription({ ...r, transactionType: 'credit' })
            })),
            ...depositsData.map(d => ({ 
                ...d, 
                amount: -d.amount, 
                transactionType: 'debit',
                description: formatStatementDescription({ ...d, transactionType: 'debit' })
            }))
        ].sort((a, b) => b.timestamp - a.timestamp);
        
        console.log('All transactions:', allTransactions.length);
        
        const totalCredited = receivedData.reduce((sum, r) => sum + r.amount, 0);
        const totalDebited = depositsData.reduce((sum, d) => sum + d.amount, 0);
        
        // Use actual wallet balance from user data
        const currentBalance = userData.balance || 0;
        
        document.getElementById('totalCredited').textContent = formatCurrency(totalCredited);
        document.getElementById('totalDebited').textContent = formatCurrency(totalDebited);
        document.getElementById('netBalance').textContent = formatCurrency(currentBalance);
        
        // Store for tab switching
        window.allUserTransactions = allTransactions;
        window.currentStatementUser = { id: userId, ...userData };
        
        // Update statement header
        document.getElementById('statementUserName').textContent = userData.email || userData.userId;
        document.getElementById('statementUserId').textContent = userId;
        
        const dates = allTransactions.map(t => t.timestamp);
        const minDate = dates.length > 0 ? Math.min(...dates) : Date.now();
        const maxDate = dates.length > 0 ? Math.max(...dates) : Date.now();
        document.getElementById('statementPeriod').textContent = `${formatDate(minDate)} to ${formatDate(maxDate)}`;
        document.getElementById('statementDate').textContent = formatDate(Date.now());
        
        renderTransactionTable(allTransactions, 'all');
        window.userReceivedData = receivedData;
        window.userDepositsData = depositsData;
        
    } catch (error) {
        console.error('Error loading transaction statement:', error);
    }
}

function renderTransactionTable(transactions, filter) {
    console.log('renderTransactionTable called:', transactions.length, 'transactions, filter:', filter);
    const tbody = document.getElementById('transactionTableBody');
    
    if (!tbody) {
        console.error('transactionTableBody not found!');
        return;
    }
    
    // Sort all transactions by timestamp DESCENDING (newest first) to compute running balances correctly
    const sortedAll = [...transactions].sort((a, b) => b.timestamp - a.timestamp);
    
    // Calculate running balance from current balance backwards on ALL transactions
    const user = window.currentStatementUser;
    const currentBalance = user?.balance || 0;
    let runningBalance = currentBalance;
    
    // First pass: calculate balances from newest to oldest on all transactions
    const processedAll = sortedAll.map(t => {
        const isCredit = t.transactionType === 'credit';
        const affectsBalance = isCredit || (t.transactionType === 'debit' && t.status === 'approved');
        
        const balanceAtThisPoint = runningBalance;
        
        // Reverse the transaction to get previous balance
        if (affectsBalance) {
            if (isCredit) {
                runningBalance -= t.amount;
            } else {
                runningBalance += Math.abs(t.amount);
            }
        }
        
        return {
            ...t,
            balanceAtThisPoint: balanceAtThisPoint,
            isCredit: isCredit
        };
    });
    
    // Apply filter
    let filtered = processedAll;
    if (filter === 'received') {
        filtered = processedAll.filter(t => t.type === 'received');
        console.log('Filtered for received:', filtered.length);
    } else if (filter === 'deposit') {
        filtered = processedAll.filter(t => t.type === 'deposit');
        console.log('Filtered for deposits:', filtered.length);
    } else {
        console.log('Showing all transactions:', filtered.length);
    }
    
    if (filtered.length === 0) {
        console.log('No transactions to display for filter:', filter);
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No transactions found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = filtered.map((t, index) => {
        const refNo = t.id ? t.id.substring(0, 12).toUpperCase() : `TXN${String(index + 1).padStart(6, '0')}`;
        
        return `
            <tr>
                <td class="col-date">${formatDate(t.timestamp)}</td>
                <td class="col-ref">${refNo}</td>
                <td class="col-desc">${formatStatementDescription(t)}</td>
                <td class="col-type"><span class="status-badge ${t.isCredit ? 'active' : 'banned'}">${t.isCredit ? 'CREDIT' : 'DEBIT'}</span></td>
                <td class="col-credit">${t.isCredit ? formatCurrency(t.amount) : '-'}</td>
                <td class="col-debit">${!t.isCredit ? formatCurrency(Math.abs(t.amount)) : '-'}</td>
                <td class="col-balance">${formatCurrency(t.balanceAtThisPoint)}</td>
                <td class="col-status">${t.type === 'deposit' ? `<span class="status-badge ${t.status}">${t.status.toUpperCase()}</span>` : '<span class="status-badge active">COMPLETED</span>'}</td>
            </tr>
        `;
    }).join('');
}

// Transaction tabs
document.querySelectorAll('.transaction-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.transaction-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const tab = btn.dataset.tab;
        renderTransactionTable(window.allUserTransactions || [], tab);
    });
});

async function loadUserReceivedHistory(userId) {
    try {
        const snapshot = await db.collection('receivedEntries')
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc')
            .get();
        
        const received = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const tbody = document.getElementById('receivedHistoryBody');
        tbody.innerHTML = received.length > 0
            ? received.map(r => `
                <tr>
                    <td class="text-success">+${formatCurrency(r.amount)}</td>
                    <td>${r.note || '-'}</td>
                    <td>${formatDate(r.timestamp)}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="3" class="empty-state">No received entries</td></tr>';
    } catch (error) {
        console.error('Error loading received history:', error);
    }
}

async function loadUserDepositHistory(userId) {
    try {
        const snapshot = await db.collection('depositEntries')
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc')
            .get();
        
        const deposits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const tbody = document.getElementById('depositHistoryBody');
        tbody.innerHTML = deposits.length > 0
            ? deposits.map(d => `
                <tr>
                    <td class="text-danger">-${formatCurrency(d.amount)}</td>
                    <td>${d.note || d.remark || d.utr || '-'}</td>
                    <td><span class="status-badge ${d.status}">${d.status}</span></td>
                    <td>${formatDate(d.timestamp)}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4" class="empty-state">No deposit entries</td></tr>';
    } catch (error) {
        console.error('Error loading deposit history:', error);
    }
}

// Export to PDF
window.exportToPDF = function() {
    try {
        // Check if jsPDF is loaded
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('error', 'Error', 'PDF library not loaded. Please refresh the page.');
            console.error('jsPDF library not found');
            return;
        }
        
        const user = window.currentStatementUser;
        if (!user) {
            showToast('error', 'Error', 'No user data available');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation
        
        const transactions = window.allUserTransactions || [];
        const totalCredited = transactions.filter(t => t.transactionType === 'credit').reduce((sum, t) => sum + t.amount, 0);
        const totalDebited = Math.abs(transactions.filter(t => t.transactionType === 'debit').reduce((sum, t) => sum + t.amount, 0));
        const currentBalance = user.balance || 0;
        
        // Header
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, 297, 40, 'F');
        
        doc.setTextColor(245, 158, 11);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('Entry Karo', 15, 20);
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text('Account Statement', 15, 30);
        
        // Account Info
        doc.setTextColor(51, 51, 51);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Account Holder:', 200, 15);
        doc.text('Account ID:', 200, 22);
        doc.text('Statement Period:', 200, 29);
        doc.text('Generated On:', 200, 36);
        
        doc.setFont('helvetica', 'normal');
        doc.text(user.email || user.userId || '-', 240, 15);
        doc.text(user.id || '-', 240, 22);
        
        const dates = transactions.map(t => t.timestamp);
        const period = dates.length > 0 
            ? `${new Date(Math.min(...dates)).toLocaleDateString('en-IN')} to ${new Date(Math.max(...dates)).toLocaleDateString('en-IN')}`
            : 'N/A';
        doc.text(period, 240, 29);
        doc.text(new Date().toLocaleDateString('en-IN'), 240, 36);
        
        // Summary Boxes
        const boxY = 50;
        
        // Credit Box
        doc.setFillColor(220, 252, 231);
        doc.setDrawColor(34, 197, 94);
        doc.rect(15, boxY, 85, 25, 'FD');
        doc.setTextColor(34, 197, 94);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL CREDITS', 20, boxY + 8);
        doc.setFontSize(14);
        doc.text(`Rs. ${totalCredited.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 20, boxY + 20);
    
        // Debit Box
        doc.setFillColor(254, 226, 226);
        doc.setDrawColor(239, 68, 68);
        doc.rect(110, boxY, 85, 25, 'FD');
        doc.setTextColor(239, 68, 68);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL DEBITS', 115, boxY + 8);
        doc.setFontSize(14);
        doc.text(`Rs. ${totalDebited.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 115, boxY + 20);
        
        // Balance Box
        doc.setFillColor(224, 242, 254);
        doc.setDrawColor(59, 130, 246);
        doc.rect(205, boxY, 77, 25, 'FD');
        doc.setTextColor(59, 130, 246);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('CURRENT BALANCE', 210, boxY + 8);
        doc.setFontSize(14);
        doc.text(`Rs. ${currentBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 210, boxY + 20);
        
        // Table - Sort by descending (newest first) for PDF
        const sorted = [...transactions].sort((a, b) => b.timestamp - a.timestamp);
        
        // Calculate running balance from current balance backwards for all transactions
        let runningBalance = currentBalance;
        for (let i = 0; i < sorted.length; i++) {
            const t = sorted[i];
            const isCredit = t.transactionType === 'credit';
            const affectsBalance = isCredit || (t.transactionType === 'debit' && t.status === 'approved');
            
            t.balanceAtThisPoint = runningBalance;
            
            if (affectsBalance) {
                if (isCredit) {
                    runningBalance -= t.amount;
                } else {
                    runningBalance += Math.abs(t.amount);
                }
            }
        }
        
        const tableData = sorted.map((t, idx) => {
            const isCredit = t.transactionType === 'credit';
            const refNo = t.id ? t.id.substring(0, 12).toUpperCase() : `TXN${String(idx + 1).padStart(6, '0')}`;
            
            return [
                new Date(t.timestamp).toLocaleString('en-IN'),
                refNo,
                formatStatementDescription(t),
                isCredit ? 'CREDIT' : 'DEBIT',
                isCredit ? t.amount.toFixed(2) : '-',
                !isCredit ? Math.abs(t.amount).toFixed(2) : '-',
                t.balanceAtThisPoint.toFixed(2),
                t.type === 'deposit' ? t.status.toUpperCase() : 'COMPLETED'
            ];
        });
        
        doc.setTextColor(51, 51, 51);
        doc.autoTable({
            startY: 85,
            head: [['Date & Time', 'Ref. No.', 'Description', 'Type', 'Credit (Rs.)', 'Debit (Rs.)', 'Balance (Rs.)', 'Status']],
            body: tableData,
            theme: 'striped',
            headStyles: {
                fillColor: [15, 23, 42],
                textColor: [245, 158, 11],
                fontStyle: 'bold',
                fontSize: 9
            },
            bodyStyles: {
                fontSize: 8,
                font: 'helvetica'
            },
            columnStyles: {
                0: { cellWidth: 40 },
                1: { cellWidth: 30 },
                2: { cellWidth: 55 },
                3: { cellWidth: 22 },
                4: { cellWidth: 25, halign: 'right' },
                5: { cellWidth: 25, halign: 'right' },
                6: { cellWidth: 28, halign: 'right' },
                7: { cellWidth: 25 }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            styles: {
                lineColor: [203, 213, 225],
                lineWidth: 0.5
            },
            margin: { left: 15, right: 15 }
        });
        
        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text('This is a computer generated statement and does not require signature.', 148, 200, { align: 'center' });
            doc.text('For any queries, please contact support.', 148, 205, { align: 'center' });
            doc.text(`Page ${i} of ${pageCount}`, 280, 205, { align: 'right' });
        }
        
        // Download
        const filename = `Statement_${user.userId || user.id || 'user'}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        
        showToast('success', 'PDF Exported', `Statement saved as ${filename}`);
    } catch (error) {
        console.error('Error generating PDF:', error);
        showToast('error', 'Export Failed', error.message || 'Failed to generate PDF');
    }
};

// Print Statement
window.printStatement = function() {
    window.print();
};

// Profile page actions
function openEditUserModalFromDetail() {
    if (currentUserDetail) {
        openEditUserModal(currentUserDetail.id);
    }
}

function openResetModalFromDetail() {
    if (currentUserDetail) {
        openResetModal(currentUserDetail.id);
    }
}

function toggleUserBanFromDetail() {
    if (!currentUserDetail) return;
    
    if (currentUserDetail.status === 'banned') {
        unbanUser(currentUserDetail.id);
    } else {
        banUser(currentUserDetail.id);
    }
}

function deleteUserFromDetail() {
    if (currentUserDetail) {
        deleteUser(currentUserDetail.id);
    }
}

// ============================================
// CREATE USER MODAL
// ============================================

function openCreateUserModal() {
    document.getElementById('createUserModal').classList.remove('hidden');
}

function closeCreateUserModal() {
    document.getElementById('createUserModal').classList.add('hidden');
    document.getElementById('createUserForm').reset();
}

document.getElementById('createUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('newUserId').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const mpin = document.getElementById('newUserMPIN').value;
    const balance = parseFloat(document.getElementById('newUserBalance').value) || 0;
    const idType = document.getElementById('newUserIdType').value;
    
    if (!/^\d{4}$/.test(mpin)) {
        showToast('error', 'Invalid MPIN', 'MPIN must be exactly 4 digits');
        return;
    }
    
    try {
        // Check if user exists
        const existingUser = await db.collection('users').doc(userId).get();
        if (existingUser.exists) {
            showToast('error', 'Error', 'User ID already exists');
            return;
        }
        
        // Hash password and MPIN
        const passwordHash = await hashString(password);
        const mpinHash = await hashString(mpin);
        
        // Create user
        await db.collection('users').doc(userId).set({
            userId: userId,
            email: email || null,
            passwordHash: passwordHash,
            mpinHash: mpinHash,
            balance: balance,
            idType: idType,
            status: 'active',
            createdAt: Date.now(),
            lastLogin: null
        });
        
        showToast('success', 'User Created', `User "${userId}" created successfully`);
        closeCreateUserModal();
        loadUsers();
        loadDashboardData();
        
    } catch (error) {
        console.error('Error creating user:', error);
        showToast('error', 'Error', 'Failed to create user');
    }
});

// ============================================
// EDIT USER MODAL
// ============================================

function openEditUserModal(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUserEmail').value = user.email || '';
    document.getElementById('editUserBalance').value = user.balance || 0;
    document.getElementById('editUserStatus').value = user.status || 'active';
    document.getElementById('editUserIdType').value = user.idType || 'ID1';
    
    document.getElementById('editUserModal').classList.remove('hidden');
}

function closeEditUserModal() {
    document.getElementById('editUserModal').classList.add('hidden');
    document.getElementById('editUserForm').reset();
}

document.getElementById('editUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('editUserId').value;
    const email = document.getElementById('editUserEmail').value.trim();
    const balance = parseFloat(document.getElementById('editUserBalance').value) || 0;
    const status = document.getElementById('editUserStatus').value;
    const idType = document.getElementById('editUserIdType').value;
    
    if (!confirm('Are you sure you want to update this user?')) return;
    
    try {
        await db.collection('users').doc(userId).update({
            email: email || null,
            balance: balance,
            status: status,
            idType: idType,
            lastUpdated: Date.now()
        });
        
        showToast('success', 'User Updated', 'User details updated successfully');
        closeEditUserModal();
        loadUsers();
        loadDashboardData();
        
        if (currentUserDetail && currentUserDetail.id === userId) {
            viewUser(userId);
        }
        
    } catch (error) {
        console.error('Error updating user:', error);
        showToast('error', 'Error', 'Failed to update user');
    }
});

// ============================================
// RESET PASSWORD MODAL
// ============================================

function openResetModal(userId) {
    document.getElementById('resetUserId').value = userId;
    document.getElementById('resetPasswordModal').classList.remove('hidden');
}

function closeResetPasswordModal() {
    document.getElementById('resetPasswordModal').classList.add('hidden');
    document.getElementById('resetPasswordForm').reset();
}

document.getElementById('resetPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('resetUserId').value;
    const password = document.getElementById('newResetPassword').value;
    const mpin = document.getElementById('newResetMPIN').value;
    
    if (!/^\d{4}$/.test(mpin)) {
        showToast('error', 'Invalid MPIN', 'MPIN must be exactly 4 digits');
        return;
    }
    
    if (!confirm('Are you sure you want to reset credentials for this user?')) return;
    
    try {
        const passwordHash = await hashString(password);
        const mpinHash = await hashString(mpin);
        
        await db.collection('users').doc(userId).update({
            passwordHash: passwordHash,
            mpinHash: mpinHash,
            lastUpdated: Date.now()
        });
        
        showToast('success', 'Credentials Reset', `Password and MPIN reset for user "${userId}"`);
        closeResetPasswordModal();
        loadUsers();
        
    } catch (error) {
        console.error('Error resetting password:', error);
        showToast('error', 'Error', 'Failed to reset credentials');
    }
});

// ============================================
// DEPOSITS
// ============================================

async function loadDeposits() {
    console.log('loadDeposits() called');
    try {
        const snapshot = await db.collection('depositEntries')
            .orderBy('timestamp', 'desc')
            .get();
        
        console.log('Deposits loaded:', snapshot.docs.length);
        deposits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Get user emails
        const userEmails = {};
        for (const deposit of deposits) {
            if (deposit.userId && !userEmails[deposit.userId]) {
                const userDoc = await db.collection('users').doc(deposit.userId).get();
                userEmails[deposit.userId] = userDoc.exists ? userDoc.data().email : deposit.userId;
            }
        }
        
        window.depositsUserEmails = userEmails;
        renderDepositsTable(deposits);
        
    } catch (error) {
        console.error('Error loading deposits:', error);
        showToast('error', 'Error', 'Failed to load deposits');
    }
}

function renderDepositsTable(depositsList) {
    console.log('renderDepositsTable called with', depositsList.length, 'deposits');
    const statusFilter = document.getElementById('depositStatusFilter')?.value || 'all';
    
    let filtered = depositsList;
    if (statusFilter !== 'all') {
        filtered = filtered.filter(d => d.status === statusFilter);
    }
    
    const tbody = document.getElementById('depositsTableBody');
    if (!tbody) {
        console.error('depositsTableBody not found!');
        return;
    }
    const userEmails = window.depositsUserEmails || {};
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No deposits found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = filtered.map(deposit => `
        <tr>
            <td>${userEmails[deposit.userId] || deposit.userId}</td>
            <td>${formatCurrency(deposit.amount)}</td>
            <td><code>${deposit.utr || 'N/A'}</code></td>
            <td>${formatDate(deposit.timestamp)}</td>
            <td><span class="status-badge ${deposit.status}">${deposit.status.toUpperCase()}</span></td>
            <td class="actions-col">
                <div class="action-btns">
                    ${deposit.status === 'pending' ? `
                        <button class="btn-icon approve" onclick="approveDeposit('${deposit.id}', '${deposit.userId}', ${deposit.amount})" title="Approve">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                            </svg>
                        </button>
                        <button class="btn-icon delete" onclick="rejectDeposit('${deposit.id}')" title="Reject">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                        </button>
                    ` : '-'}
                </div>
            </td>
        </tr>
    `).join('');
}

document.getElementById('depositStatusFilter')?.addEventListener('change', () => {
    renderDepositsTable(deposits);
});

async function approveDeposit(depositId, userId, amount) {
    if (!confirm(`Approve this deposit?\n\nAmount: ${formatCurrency(amount)}\nThis will be deducted from user's wallet.`)) return;
    
    try {
        // Get user data
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            showToast('error', 'Error', 'User not found');
            return;
        }
        
        const userData = userDoc.data();
        const currentBalance = userData.balance || 0;
        
        // Check sufficient balance
        if (currentBalance < amount) {
            showToast('error', 'Insufficient Balance', 
                `User has ${formatCurrency(currentBalance)} but needs ${formatCurrency(amount)}`);
            return;
        }
        
        // Check deposit status
        const depositDoc = await db.collection('depositEntries').doc(depositId).get();
        if (!depositDoc.exists || depositDoc.data().status !== 'pending') {
            showToast('warning', 'Already Processed', 'This deposit has already been processed');
            return;
        }
        
        const newBalance = currentBalance - amount;
        
        // Batch update
        const batch = db.batch();
        
        batch.update(db.collection('depositEntries').doc(depositId), {
            status: 'approved',
            approvedAt: Date.now(),
            approvedBy: currentAdmin.id,
            previousBalance: currentBalance,
            newBalance: newBalance
        });
        
        batch.update(db.collection('users').doc(userId), {
            balance: newBalance,
            lastDepositDeduction: Date.now()
        });
        
        await batch.commit();
        
        showToast('success', 'Deposit Approved', 
            `${formatCurrency(amount)} deducted. New balance: ${formatCurrency(newBalance)}`);
        
        loadDeposits();
        loadDashboardData();
        
    } catch (error) {
        console.error('Error approving deposit:', error);
        showToast('error', 'Error', 'Failed to approve deposit');
    }
}

async function rejectDeposit(depositId) {
    if (!confirm('Reject this deposit?\n\nNo balance will be deducted from the user.')) return;
    
    try {
        const depositDoc = await db.collection('depositEntries').doc(depositId).get();
        if (!depositDoc.exists || depositDoc.data().status !== 'pending') {
            showToast('warning', 'Already Processed', 'This deposit has already been processed');
            return;
        }
        
        await db.collection('depositEntries').doc(depositId).update({
            status: 'rejected',
            rejectedAt: Date.now(),
            rejectedBy: currentAdmin.id
        });
        
        showToast('warning', 'Deposit Rejected', 'Deposit rejected. No balance deducted.');
        loadDeposits();
        loadDashboardData();
        
    } catch (error) {
        console.error('Error rejecting deposit:', error);
        showToast('error', 'Error', 'Failed to reject deposit');
    }
}

// ============================================
// RECEIVED ENTRIES
// ============================================

async function loadReceivedEntries() {
    console.log('loadReceivedEntries() called');
    try {
        const snapshot = await db.collection('receivedEntries')
            .orderBy('timestamp', 'desc')
            .get();
        
        console.log('Received entries loaded:', snapshot.docs.length);
        receivedEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Get user emails
        const userEmails = {};
        for (const entry of receivedEntries) {
            if (entry.userId && !userEmails[entry.userId]) {
                const userDoc = await db.collection('users').doc(entry.userId).get();
                userEmails[entry.userId] = userDoc.exists ? userDoc.data().email : entry.userId;
            }
        }
        
        window.receivedUserEmails = userEmails;
        
        const tbody = document.getElementById('receivedTableBody');
        if (!tbody) {
            console.error('receivedTableBody not found!');
            return;
        }
        
        if (receivedEntries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No received entries</td></tr>`;
            return;
        }
        
        tbody.innerHTML = receivedEntries.map(entry => `
            <tr>
                <td>${userEmails[entry.userId] || entry.userId}</td>
                <td class="text-success">+${formatCurrency(entry.amount)}</td>
                <td>${entry.note || '-'}</td>
                <td>${formatDate(entry.timestamp)}</td>
                <td class="actions-col">
                    <div class="action-btns">
                        <button class="btn-icon delete" onclick="deleteReceivedEntry('${entry.id}')" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading received entries:', error);
        showToast('error', 'Error', 'Failed to load received entries');
    }
}

async function deleteReceivedEntry(entryId) {
    if (!confirm('Are you sure you want to delete this received entry?\n\nThis action cannot be undone.')) return;
    
    try {
        await db.collection('receivedEntries').doc(entryId).delete();
        showToast('success', 'Entry Deleted', 'Received entry deleted successfully');
        loadReceivedEntries();
    } catch (error) {
        console.error('Error deleting entry:', error);
        showToast('error', 'Error', 'Failed to delete entry');
    }
}

// Add Received Modal
async function openAddReceivedModal() {
    const select = document.getElementById('receivedUserSelect');
    const searchInput = document.getElementById('receivedUserSearch');
    
    select.innerHTML = '<option value="">Select a user...</option>';
    searchInput.value = '';
    
    try {
        const snapshot = await db.collection('users')
            .where('status', '==', 'active')
            .get();
        
        allUsersForReceived = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateUserDropdown(allUsersForReceived);
        
        // Search functionality
        searchInput.oninput = (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            if (searchTerm === '') {
                populateUserDropdown(allUsersForReceived);
            } else {
                const filtered = allUsersForReceived.filter(user => {
                    const email = (user.email || '').toLowerCase();
                    const userId = (user.userId || '').toLowerCase();
                    return email.includes(searchTerm) || userId.includes(searchTerm);
                });
                populateUserDropdown(filtered);
            }
        };
        
        document.getElementById('addReceivedModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Error loading users:', error);
        showToast('error', 'Error', 'Failed to load users');
    }
}

function populateUserDropdown(usersList) {
    const select = document.getElementById('receivedUserSelect');
    select.innerHTML = '<option value="">Select a user...</option>';
    
    usersList.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.email || user.userId || 'Unknown'} (${formatCurrency(user.balance || 0)})`;
        select.appendChild(option);
    });
}

function closeAddReceivedModal() {
    document.getElementById('addReceivedModal').classList.add('hidden');
    document.getElementById('addReceivedForm').reset();
}

document.getElementById('addReceivedForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('receivedUserSelect').value;
    const amount = parseFloat(document.getElementById('receivedAmount').value);
    const note = document.getElementById('receivedNote').value.trim();
    
    if (!userId) {
        showToast('error', 'Error', 'Please select a user');
        return;
    }
    
    if (!amount || amount <= 0) {
        showToast('error', 'Error', 'Please enter a valid amount');
        return;
    }
    
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            showToast('error', 'Error', 'User not found');
            return;
        }
        
        const userData = userDoc.data();
        const userEmail = userData.email || 'N/A';
        const currentBalance = userData.balance || 0;
        const newBalance = currentBalance + amount;
        
        const batch = db.batch();
        
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
        
        batch.update(db.collection('users').doc(userId), {
            balance: newBalance,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();
        
        showToast('success', 'Entry Created', 
            `${formatCurrency(amount)} added to ${userEmail}. New balance: ${formatCurrency(newBalance)}`);
        
        closeAddReceivedModal();
        loadReceivedEntries();
        loadDashboardData();
        
    } catch (error) {
        console.error('Error creating entry:', error);
        showToast('error', 'Error', 'Failed to create entry');
    }
});

// ADD PURCHASE MODAL (DEDUCTION)
// ============================================

let allUsersForPurchase = [];

async function openAddPurchaseModal() {
    console.log('openAddPurchaseModal() called');
    const select = document.getElementById('purchaseUserSelect');
    const searchInput = document.getElementById('purchaseUserSearch');
    
    if (!select || !searchInput) {
        console.error('Purchase user elements not found!');
        return;
    }
    
    select.innerHTML = '<option value="">Select a user...</option>';
    searchInput.value = '';
    
    try {
        const snapshot = await db.collection('users')
            .where('status', '==', 'active')
            .get();
        
        allUsersForPurchase = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populatePurchaseUserDropdown(allUsersForPurchase);
        
        // Search functionality
        searchInput.oninput = (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            if (searchTerm === '') {
                populatePurchaseUserDropdown(allUsersForPurchase);
            } else {
                const filtered = allUsersForPurchase.filter(user => {
                    const email = (user.email || '').toLowerCase();
                    const userId = (user.userId || '').toLowerCase();
                    return email.includes(searchTerm) || userId.includes(searchTerm);
                });
                populatePurchaseUserDropdown(filtered);
            }
        };
        
        document.getElementById('addPurchaseModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Error loading users for purchase:', error);
        showToast('error', 'Error', 'Failed to load users');
    }
}

function populatePurchaseUserDropdown(usersList) {
    const select = document.getElementById('purchaseUserSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Select a user...</option>';
    
    usersList.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.email || user.userId || 'Unknown'} (${formatCurrency(user.balance || 0)})`;
        select.appendChild(option);
    });
}

function closeAddPurchaseModal() {
    document.getElementById('addPurchaseModal').classList.add('hidden');
    document.getElementById('addPurchaseForm').reset();
}

document.getElementById('addPurchaseForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('purchaseUserSelect').value;
    const amount = parseFloat(document.getElementById('purchaseAmount').value);
    const note = document.getElementById('purchaseNote').value.trim();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    if (!userId) {
        showToast('error', 'Error', 'Please select a user');
        return;
    }
    
    if (!amount || amount <= 0) {
        showToast('error', 'Error', 'Please enter a valid amount');
        return;
    }
    
    // Client-side balance validation (from cache list)
    const targetUser = allUsersForPurchase.find(u => u.id === userId);
    const availableBalance = Number(targetUser ? targetUser.balance : 0);
    if (availableBalance < amount) {
        showToast('error', 'Insufficient Balance', 
            `User only has ${formatCurrency(availableBalance)} but the purchase requires ${formatCurrency(amount)}`);
        return;
    }
    
    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Processing Deduction...';
        }
        
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(userId);
            const userSnap = await transaction.get(userRef);
            
            if (!userSnap.exists) {
                throw new Error('User profile not found in database.');
            }
            
            const userData = userSnap.data();
            const currentBalance = Number(userData.balance || 0);
            const currentPurchase = Number(userData.totalPurchase || 0);
            
            if (currentBalance < amount) {
                throw new Error(`Insufficient Balance. User only has ${formatCurrency(currentBalance)}`);
            }
            
            const newBalance = currentBalance - amount;
            
            // 1. Update user balance and totalPurchase
            transaction.update(userRef, {
                balance: newBalance,
                totalPurchase: currentPurchase + amount,
                lastDepositDeduction: Date.now()
            });
            
            // 2. Write depositEntries approved entry
            const depositRef = db.collection('depositEntries').doc();
            transaction.set(depositRef, {
                userId: userId,
                userEmail: userData.email || userId,
                amount: amount,
                utr: note || "ADM-" + Date.now().toString().slice(-6),
                remark: note || "",
                status: "approved",
                timestamp: Date.now(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                approvedAt: Date.now(),
                approvedBy: currentAdmin ? (currentAdmin.email || currentAdmin.id || 'Admin') : 'Admin'
            });
            
            // 3. Write transactions history log
            const transRef = db.collection('transactions').doc();
            transaction.set(transRef, {
                userEmail: userData.email || userId,
                type: 'purchase',
                amount: amount,
                remark: note || '',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                processedBy: currentAdmin ? (currentAdmin.email || currentAdmin.id || 'Admin') : 'Admin'
            });
        });
        
        showToast('success', 'Purchase Logged', `Successfully debited ${formatCurrency(amount)} from ${targetUser ? targetUser.email : userId}`);
        closeAddPurchaseModal();
        
        // Refresh views
        if (typeof loadDeposits === 'function') loadDeposits();
        if (typeof loadDashboardData === 'function') loadDashboardData();
        
    } catch (error) {
        console.error('Error logging purchase deduction:', error);
        showToast('error', 'Deduction Failed', error.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                Submit Purchase
            `;
        }
    }
});

// ============================================
// SETTINGS
// ============================================

async function loadSettings() {
    try {
        // Load freeze status
        const settingsDoc = await db.collection('appSettings').doc('config').get();
        if (settingsDoc.exists) {
            document.getElementById('freezeAppToggle').checked = settingsDoc.data().isFrozen || false;
        }

        // Load employee panel status
        const empPanelDoc = await db.collection('settings').doc('system').get();
        if (empPanelDoc.exists) {
            const toggle = document.getElementById('employeePanelToggle');
            if (toggle) toggle.checked = empPanelDoc.data().employeePanelEnabled || false;
        }
        
        // Load call status
        const callDoc = await db.collection('activeGroupCall').doc('current').get();
        const callStatus = callDoc.exists && callDoc.data().status === 'active';
        
        document.getElementById('activeCallStatus').textContent = callStatus 
            ? 'Call in progress (' + (callDoc.data().participantsCount || 0) + ' participants)'
            : 'No active call';
        document.getElementById('endCallBtn').disabled = !callStatus;
        
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Freeze App Toggle
document.getElementById('freezeAppToggle')?.addEventListener('change', async (e) => {
    try {
        await db.collection('appSettings').doc('config').set({
            isFrozen: e.target.checked
        }, { merge: true });
        
        showToast(e.target.checked ? 'warning' : 'success', 
            e.target.checked ? 'App Frozen' : 'App Unfrozen',
            e.target.checked ? 'App access has been disabled for all users' : 'App access has been restored');
    } catch (error) {
        console.error('Error updating settings:', error);
        showToast('error', 'Error', 'Failed to update settings');
    }
});

// Employee Panel Toggle
document.getElementById('employeePanelToggle')?.addEventListener('change', async (e) => {
    try {
        await db.collection('settings').doc('system').set({
            employeePanelEnabled: e.target.checked
        }, { merge: true });
        
        showToast(e.target.checked ? 'success' : 'warning', 
            e.target.checked ? 'Employee Panel Enabled' : 'Employee Panel Disabled',
            e.target.checked ? 'Employees can now log in to the panel' : 'Employee access has been blocked');
    } catch (error) {
        console.error('Error updating settings:', error);
        showToast('error', 'Error', 'Failed to update settings');
    }
});

// End Call
async function endActiveCall() {
    if (!confirm('Are you sure you want to end the active call?\n\nAll participants will be disconnected.')) return;
    
    try {
        const batch = db.batch();
        
        // Get all participants
        const participantsSnapshot = await db.collection('callParticipants').get();
        participantsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        
        // Update call status
        batch.update(db.collection('activeGroupCall').doc('current'), {
            status: 'inactive',
            participantsCount: 0,
            endedAt: Date.now(),
            endedBy: currentAdmin.id
        });
        
        await batch.commit();
        
        showToast('success', 'Call Ended', 'Active call has been terminated');
        loadSettings();
        
    } catch (error) {
        console.error('Error ending call:', error);
        showToast('error', 'Error', 'Failed to end call');
    }
}

// ============================================
// HEADER CLOCK & REFRESH
// ============================================

function updateTime() {
    const timeEl = document.getElementById('headerTime');
    if (timeEl) {
        timeEl.textContent = new Date().toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
setInterval(updateTime, 1000);
updateTime();

// Refresh button
document.getElementById('refreshBtn')?.addEventListener('click', () => {
    const activePage = document.querySelector('.page.active');
    if (activePage) {
        const pageId = activePage.id.replace('page-', '');
        loadPageData(pageId);
    }
    showToast('success', 'Refreshed', 'Data refreshed successfully');
});

// Fullscreen toggle
document.getElementById('fullscreenBtn')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

// ============================================
// INITIALIZATION
// ============================================

console.log('Entry Karo Admin Panel v2.0 - Initialized');


// ============================================
// EMPLOYEE MANAGEMENT & ID STATEMENTS
// ============================================

let employees = [];
let idAccounts = [];
let employeeListeners = [];
let idAccountsListener = null;

// Modal Openers & Closers
function openCreateEmployeeModal() {
    document.getElementById('createEmployeeModal').classList.remove('hidden');
}
function closeCreateEmployeeModal() {
    document.getElementById('createEmployeeModal').classList.add('hidden');
    document.getElementById('createEmployeeForm').reset();
}
function openEditEmployeeModal(empId) {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    document.getElementById('editEmpId').value = empId;
    document.getElementById('editEmpEmail').value = emp.email || '';
    document.getElementById('editEmpName').value = emp.name || '';
    document.getElementById('editEmpEnabled').value = (emp.enabled !== false).toString();
    
    const perms = emp.permissions || {};
    const permList = ['dashboard', 'received', 'purchase', 'upi', 'idAccount', 'notebook', 'search', 'profile'];
    permList.forEach(p => {
        const checkbox = document.getElementById(`edit_perm_${p}`);
        if (checkbox) checkbox.checked = perms[p] === true;
    });
    
    // Load logs
    loadEmployeeLogs(emp.email);
    
    document.getElementById('editEmployeeModal').classList.remove('hidden');
}
function closeEditEmployeeModal() {
    document.getElementById('editEmployeeModal').classList.add('hidden');
    document.getElementById('editEmployeeForm').reset();
}

// Load Employees
function loadEmployees() {
    console.log('loadEmployees() called');
    employeeListeners.forEach(unsub => unsub());
    employeeListeners = [];
    
    let employeesMap = new Map();
    console.log('Registering snapshot listeners for employees and admins...');
    
    const unsub1 = db.collection('employees').onSnapshot((snapshot) => {
        console.log('Employees snapshot listener fired. Document count:', snapshot.size);
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            employeesMap.set(doc.id, { 
                id: doc.id, 
                collection: 'employees',
                name: data.name || data.Name || 'N/A',
                email: data.email || data.Email || 'N/A',
                role: data.role || data.Role || 'employee',
                enabled: data.enabled !== false && data.Enabled !== false,
                permissions: data.permissions || data.Permissions || {
                    dashboard: true,
                    received: true,
                    purchase: true,
                    upi: true,
                    idAccount: true,
                    notebook: true,
                    search: true,
                    profile: true
                },
                online: data.online || false,
                lastLogin: data.lastLogin || data.LastLogin || null
            });
        });
        updateEmployeesList();
    }, (error) => {
        console.error('Error listening to employees:', error);
    });
    
    const unsub2 = db.collection('admins').onSnapshot((snapshot) => {
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.Role === 'Account management Employee ' || data.role === 'employee') {
                employeesMap.set(doc.id, { 
                    id: doc.id, 
                    collection: 'admins',
                    name: data.name || data.Name || 'Rakibul',
                    email: data.email || data.Email,
                    role: 'employee',
                    enabled: data.enabled !== false,
                    permissions: data.permissions || {
                        dashboard: true,
                        received: true,
                        purchase: true,
                        upi: true,
                        idAccount: true,
                        notebook: true,
                        search: true,
                        profile: true
                    },
                    online: data.online || false,
                    lastLogin: data.lastLogin || null
                });
            }
        });
        updateEmployeesList();
    }, (error) => {
        console.error('Error listening to admins for employees:', error);
    });
    
    employeeListeners.push(unsub1, unsub2);
    
    function updateEmployeesList() {
        employees = Array.from(employeesMap.values());
        renderEmployees();
    }
}

function renderEmployees() {
    console.log('renderEmployees() called. Total employees:', employees.length);
    const tbody = document.getElementById('employeesTableBody');
    if (!tbody) {
        console.error('Error: employeesTableBody element not found in DOM!');
        return;
    }
    const searchVal = document.getElementById('employeeSearch')?.value.toLowerCase().trim() || '';
    
    let filtered = employees;
    if (searchVal) {
        filtered = employees.filter(e => e.email?.toLowerCase().includes(searchVal) || e.name?.toLowerCase().includes(searchVal));
    }
    console.log('Rendering employees. Filtered count:', filtered.length);
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No employees found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = filtered.map(emp => {
        const statusClass = emp.enabled !== false ? 'status-active' : 'status-banned';
        const statusText = emp.enabled !== false ? 'Enabled' : 'Disabled';
        const isOnline = emp.online === true;
        const onlineBadge = isOnline 
            ? `<span class="status-badge" style="background: var(--success); color: white; border: none; padding: 2px 8px; border-radius: var(--radius-sm);">Online</span>`
            : `<span class="status-badge" style="background: var(--bg-hover); color: var(--text-secondary); border: none; padding: 2px 8px; border-radius: var(--radius-sm);">Offline</span>`;
        
        const lastLoginStr = emp.lastLogin ? formatDate(emp.lastLogin) : 'Never';
        
        return `
            <tr>
                <td><strong>${emp.name || 'N/A'}</strong></td>
                <td>${emp.email || 'N/A'}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${lastLoginStr}</td>
                <td>${onlineBadge}</td>
                <td class="actions-col">
                    <button class="btn btn-secondary" onclick="openEditEmployeeModal('${emp.id}')">Edit / Permissions</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Bind search field
document.getElementById('employeeSearch')?.addEventListener('input', renderEmployees);

// Create Employee Form Handler
document.getElementById('createEmployeeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newEmpName').value.trim();
    const email = document.getElementById('newEmpEmail').value.trim();
    const password = document.getElementById('newEmpPassword').value;
    const enabled = document.getElementById('newEmpEnabled').value === 'true';
    
    const permissions = {};
    const permList = ['dashboard', 'received', 'purchase', 'upi', 'idAccount', 'notebook', 'search', 'profile'];
    permList.forEach(p => {
        permissions[p] = document.getElementById(`perm_${p}`).checked;
    });
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    
    try {
        // Initialize temporary secondary Firebase instance
        const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp" + Date.now());
        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;
        
        // Clean up secondary auth
        await secondaryApp.auth().signOut();
        await secondaryApp.delete();
        
        // Write record to /employees collection (writing both lowercase and capitalized keys)
        await db.collection('employees').doc(uid).set({
            uid: uid,
            name: name,
            Name: name,
            email: email,
            Email: email,
            role: 'employee',
            Role: 'employee',
            enabled: enabled,
            Enabled: enabled,
            permissions: permissions,
            Permissions: permissions,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: null
        });
        
        showToast('success', 'Employee Created', `Employee "${name}" created successfully`);
        closeCreateEmployeeModal();
    } catch (error) {
        console.error('Error creating employee:', error);
        showToast('error', 'Error', error.message || 'Failed to create employee');
    } finally {
        submitBtn.disabled = false;
    }
});

// Edit Employee Form Handler
document.getElementById('editEmployeeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = document.getElementById('editEmpId').value;
    const name = document.getElementById('editEmpName').value.trim();
    const enabled = document.getElementById('editEmpEnabled').value === 'true';
    
    const permissions = {};
    const permList = ['dashboard', 'received', 'purchase', 'upi', 'idAccount', 'notebook', 'search', 'profile'];
    permList.forEach(p => {
        permissions[p] = document.getElementById(`edit_perm_${p}`).checked;
    });
    
    const emp = employees.find(e => e.id === uid);
    const coll = emp ? emp.collection : 'employees';
    
    try {
        const updateData = {
            name: name,
            Name: name,
            enabled: enabled,
            Enabled: enabled,
            permissions: permissions,
            Permissions: permissions,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (coll === 'admins') {
            updateData.Role = 'Account management Employee ';
            updateData.Name = name;
        }
        
        await db.collection(coll).doc(uid).update(updateData);
        
        showToast('success', 'Employee Updated', 'Permissions and status updated');
        closeEditEmployeeModal();
    } catch (error) {
        console.error('Error updating employee:', error);
        showToast('error', 'Error', 'Failed to update employee details');
    }
});

// Password Reset Email Trigger
async function triggerEmpPasswordReset() {
    const email = document.getElementById('editEmpEmail').value;
    if (!email) return;
    if (!confirm(`Send password reset email to ${email}?`)) return;
    
    try {
        await auth.sendPasswordResetEmail(email);
        showToast('success', 'Reset Email Sent', `Password reset instructions sent to ${email}`);
    } catch (error) {
        console.error('Error sending reset email:', error);
        showToast('error', 'Error', 'Failed to send password reset email');
    }
}

// Delete Employee trigger
async function triggerEmpDelete() {
    const uid = document.getElementById('editEmpId').value;
    const name = document.getElementById('editEmpName').value;
    if (!uid) return;
    if (!confirm(`Are you sure you want to delete employee "${name}"? This will block their login access.`)) return;
    
    const emp = employees.find(e => e.id === uid);
    const coll = emp ? emp.collection : 'employees';
    
    try {
        await db.collection(coll).doc(uid).delete();
        showToast('warning', 'Employee Deleted', 'Employee record removed from Firestore');
        closeEditEmployeeModal();
    } catch (error) {
        console.error('Error deleting employee:', error);
        showToast('error', 'Error', 'Failed to delete employee profile');
    }
}

// Load Employee Activity Logs (Audit Logs)
async function loadEmployeeLogs(email) {
    const logsContainer = document.getElementById('editEmpLogsList');
    logsContainer.innerHTML = 'Loading activity logs...';
    
    try {
        const snapshot = await db.collection('employeeLogs')
            .where('employeeEmail', '==', email)
            .get();
            
        if (snapshot.empty) {
            logsContainer.innerHTML = 'No activity logs found for this employee.';
            return;
        }
        
        let docs = snapshot.docs.map(doc => doc.data());
        // Sort client-side by timestamp descending
        docs.sort((a, b) => {
            const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return tB - tA;
        });
        
        // Limit to 50
        const limitedDocs = docs.slice(0, 50);
        
        logsContainer.innerHTML = limitedDocs.map(log => {
            const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN') : 'N/A';
            return `[${dateStr}] ${log.action} on ${log.collection} (${log.documentId || 'N/A'}) - Status: ${log.status}`;
        }).join('<br>');
    } catch (error) {
        console.error('Error loading employee logs:', error);
        logsContainer.innerHTML = 'Error loading logs: ' + error.message;
    }
}

// ID Statements
function loadIdStatements() {
    console.log('loadIdStatements() called');
    if (idAccountsListener) {
        console.log('Unsubscribing previous ID accounts listener...');
        idAccountsListener();
    }
    
    console.log('Registering snapshot listener for id_accounts...');
    idAccountsListener = db.collection('id_accounts')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            console.log('ID accounts snapshot listener fired. Document count:', snapshot.size);
            idAccounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderIdStatements();
        }, (error) => {
            console.error('Error listening to ID accounts:', error);
            showToast('error', 'Error', 'Failed to load ID statements');
        });
}

function renderIdStatements() {
    console.log('renderIdStatements() called. Total statements:', idAccounts.length);
    const tbody = document.getElementById('idStatementsTableBody');
    if (!tbody) {
        console.error('Error: idStatementsTableBody element not found in DOM!');
        return;
    }
    const searchVal = document.getElementById('idStatementSearch')?.value.toLowerCase().trim() || '';
    const typeFilter = document.getElementById('idTypeFilter')?.value || 'all';
    const entryTypeFilter = document.getElementById('idEntryTypeFilter')?.value || 'all';
    const dateFilter = document.getElementById('idDateFilter')?.value || '';
    
    let filtered = idAccounts;
    
    if (searchVal) {
        filtered = filtered.filter(item => 
            (item.createdBy || '').toLowerCase().includes(searchVal) ||
            (item.remarks || '').toLowerCase().includes(searchVal)
        );
    }
    
    if (typeFilter !== 'all') {
        filtered = filtered.filter(item => item.idType === typeFilter);
    }
    
    if (entryTypeFilter !== 'all') {
        filtered = filtered.filter(item => item.type === entryTypeFilter);
    }
    
    if (dateFilter) {
        filtered = filtered.filter(item => {
            if (!item.timestamp) return false;
            const itemDate = new Date(item.timestamp.seconds * 1000).toISOString().split('T')[0];
            return itemDate === dateFilter;
        });
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No ID statement records found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = filtered.map(item => {
        const dateStr = item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleString('en-IN') : 'Sync...';
        const typeClass = item.type === 'sell' ? 'text-success' : 'text-danger';
        
        return `
            <tr>
                <td>${dateStr}</td>
                <td><strong>${item.idType || 'N/A'}</strong></td>
                <td><span class="${typeClass}" style="text-transform: uppercase; font-weight: bold;">${item.type || 'N/A'}</span></td>
                <td><strong>${formatCurrency(item.amount)}</strong></td>
                <td>${item.createdBy || 'N/A'}</td>
                <td>${item.remarks || 'None'}</td>
            </tr>
        `;
    }).join('');
}

// Bind search & filter inputs for ID Statements
document.getElementById('idStatementSearch')?.addEventListener('input', renderIdStatements);
document.getElementById('idTypeFilter')?.addEventListener('change', renderIdStatements);
document.getElementById('idEntryTypeFilter')?.addEventListener('change', renderIdStatements);
document.getElementById('idDateFilter')?.addEventListener('change', renderIdStatements);

// Export ID Statements
window.exportIDStatements = function(format) {
    const searchVal = document.getElementById('idStatementSearch')?.value.toLowerCase().trim() || '';
    const typeFilter = document.getElementById('idTypeFilter')?.value || 'all';
    const entryTypeFilter = document.getElementById('idEntryTypeFilter')?.value || 'all';
    const dateFilter = document.getElementById('idDateFilter')?.value || '';
    
    let filtered = idAccounts;
    
    if (searchVal) {
        filtered = filtered.filter(item => 
            (item.createdBy || '').toLowerCase().includes(searchVal) ||
            (item.remarks || '').toLowerCase().includes(searchVal)
        );
    }
    if (typeFilter !== 'all') {
        filtered = filtered.filter(item => item.idType === typeFilter);
    }
    if (entryTypeFilter !== 'all') {
        filtered = filtered.filter(item => item.type === entryTypeFilter);
    }
    if (dateFilter) {
        filtered = filtered.filter(item => {
            if (!item.timestamp) return false;
            const itemDate = new Date(item.timestamp.seconds * 1000).toISOString().split('T')[0];
            return itemDate === dateFilter;
        });
    }
    
    if (filtered.length === 0) {
        showToast('warning', 'Export Empty', 'No records to export');
        return;
    }
    
    if (format === 'csv') {
        let csvContent = "data:text/csv;charset=utf-8,Date,Account,Type,Amount,Employee Name,Remarks\n";
        filtered.forEach(item => {
            const dateStr = item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleString('en-IN') : 'Sync';
            csvContent += `"${dateStr}","${item.idType}","${item.type}","${item.amount}","${item.createdBy}","${item.remarks || ''}"\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `ID_Statements_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('success', 'Export Successful', 'CSV downloaded');
    } else if (format === 'pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.text("Entry Karo - ID Statements Report", 14, 15);
        
        const headers = [["Date", "Account", "Type", "Amount", "Employee Name", "Remarks"]];
        const data = filtered.map(item => [
            item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleString('en-IN') : 'Sync',
            item.idType,
            item.type.toUpperCase(),
            'INR ' + item.amount.toFixed(2),
            item.createdBy,
            item.remarks || ''
        ]);
        
        doc.autoTable({
            head: headers,
            body: data,
            startY: 20
        });
        
        doc.save(`ID_Statements_${Date.now()}.pdf`);
        showToast('success', 'Export Successful', 'PDF downloaded');
    }
};

// Print ID Statements (Formatted like a Bank Statement)
function printIDStatements() {
    const searchVal = document.getElementById('idStatementSearch')?.value.toLowerCase().trim() || '';
    const typeFilter = document.getElementById('idTypeFilter')?.value || 'all';
    const entryTypeFilter = document.getElementById('idEntryTypeFilter')?.value || 'all';
    const dateFilter = document.getElementById('idDateFilter')?.value || '';
    
    let filtered = idAccounts;
    
    if (searchVal) {
        filtered = filtered.filter(item => 
            (item.createdBy || '').toLowerCase().includes(searchVal) ||
            (item.remarks || '').toLowerCase().includes(searchVal)
        );
    }
    if (typeFilter !== 'all') {
        filtered = filtered.filter(item => item.idType === typeFilter);
    }
    if (entryTypeFilter !== 'all') {
        filtered = filtered.filter(item => item.type === entryTypeFilter);
    }
    if (dateFilter) {
        filtered = filtered.filter(item => {
            if (!item.timestamp) return false;
            const itemDate = new Date(item.timestamp.seconds * 1000).toISOString().split('T')[0];
            return itemDate === dateFilter;
        });
    }
    
    if (filtered.length === 0) {
        showToast('warning', 'Print Empty', 'No records to print');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    const tableRows = filtered.map(item => {
        const dateStr = item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleString('en-IN') : 'Sync';
        const typeStr = (item.type || 'N/A').toUpperCase();
        const typeStyle = item.type === 'sell' ? 'color: #10b981; font-weight: bold;' : 'color: #ef4444; font-weight: bold;';
        return `
            <tr>
                <td>${dateStr}</td>
                <td>${item.idType || 'N/A'}</td>
                <td style="${typeStyle}">${typeStr}</td>
                <td>₹${item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td>${item.createdBy || 'N/A'}</td>
                <td>${item.remarks || 'None'}</td>
            </tr>
        `;
    }).join('');
    
    printWindow.document.write(`
        <html>
        <head>
            <title>Entry Karo - ID Statements Bank Report</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #1e293b; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 30px; }
                .header h1 { margin: 0; font-size: 24px; color: #0f172a; }
                .header p { margin: 5px 0 0 0; font-size: 14px; color: #64748b; }
                .meta-info { margin-bottom: 20px; font-size: 13px; color: #475569; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; font-size: 13px; }
                th { background-color: #f8fafc; font-weight: 600; color: #334155; }
                tr:nth-child(even) { background-color: #f8fafc; }
                .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
                @media print {
                    body { padding: 0; }
                    button { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1>ENTRY KARO</h1>
                    <p>Official ID Statement Ledger / Bank Report</p>
                </div>
                <div style="text-align: right;">
                    <p style="font-weight: bold; color: #0f172a;">Statement Date</p>
                    <p>${new Date().toLocaleString('en-IN')}</p>
                </div>
            </div>
            
            <div class="meta-info">
                <strong>Filters Applied:</strong> Account: ${typeFilter.toUpperCase()} | Type: ${entryTypeFilter.toUpperCase()} ${dateFilter ? ' | Date: ' + dateFilter : ''}
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Date & Time</th>
                        <th>Account</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Logged By</th>
                        <th>Remarks / Description</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            
            <div class="footer">
                This is a computer-generated bank statement from Entry Karo Admin Panel and requires no signature.
            </div>
            
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Bind functions to window
window.openCreateEmployeeModal = openCreateEmployeeModal;
window.closeCreateEmployeeModal = closeCreateEmployeeModal;
window.openEditEmployeeModal = openEditEmployeeModal;
window.closeEditEmployeeModal = closeEditEmployeeModal;
window.triggerEmpPasswordReset = triggerEmpPasswordReset;
window.triggerEmpDelete = triggerEmpDelete;
window.printIDStatements = printIDStatements;

// ============================================
// SUBSCRIPTION MANAGEMENT MODULE (PRD v2.0)
// ============================================
let subscriptionRequests = [];
let subscriptionsMap = {};
let subscriptionHistory = [];
let subscriptionSettings = {
    subscriptionGateEnabled: false,
    maintenanceMode: false,
    monthlyPrice: 149,
    planName: 'Monthly',
    durationDays: 30,
    upiId: 'entrykaro@upi',
    qrImageUrl: '',
    paymentInstructions: 'Pay ₹149 through the UPI ID/QR above and enter your payment UTR/Reference number.',
    utrMinLength: 10,
    utrMaxLength: 22,
    renewalReminderDays: 5,
    gracePeriodDays: 0
};
let currentSubTab = 'pending';
let subListenersActive = false;

function loadSubscriptionsData() {
    console.log('Loading Subscriptions Data...');
    if (typeof users === 'undefined' || !users || users.length === 0) {
        loadUsers();
    }
    fetchSubscriptionSettings();
    initSubscriptionListeners();
}

function initSubscriptionListeners() {
    if (subListenersActive) return;
    subListenersActive = true;

    // Listen to subscription requests
    db.collection('subscriptionRequests')
      .orderBy('submittedAt', 'desc')
      .onSnapshot(snapshot => {
          subscriptionRequests = [];
          snapshot.forEach(doc => {
              subscriptionRequests.push({ id: doc.id, ...doc.data() });
          });
          renderSubscriptionsUI();
      }, err => {
          console.error('Error listening to subscriptionRequests:', err);
      });

    // Listen to subscriptions collection
    db.collection('subscriptions')
      .onSnapshot(snapshot => {
          subscriptionsMap = {};
          snapshot.forEach(doc => {
              subscriptionsMap[doc.id] = { uid: doc.id, ...doc.data() };
          });
          renderSubscriptionsUI();
      }, err => {
          console.error('Error listening to subscriptions:', err);
      });

    // Listen to subscription history
    db.collection('subscriptionHistory')
      .orderBy('performedAt', 'desc')
      .limit(200)
      .onSnapshot(snapshot => {
          subscriptionHistory = [];
          snapshot.forEach(doc => {
              subscriptionHistory.push({ id: doc.id, ...doc.data() });
          });
          if (currentSubTab === 'history') {
              renderSubHistoryTable();
          }
      }, err => {
          console.error('Error listening to subscriptionHistory:', err);
      });
}

function fetchSubscriptionSettings() {
    db.collection('appSettings').doc('subscription').get().then(doc => {
        if (doc.exists && doc.data()) {
            subscriptionSettings = { ...subscriptionSettings, ...doc.data() };
        }
        populateSubscriptionSettingsForm();
    }).catch(err => {
        console.error('Error fetching subscription settings:', err);
    });
}

function renderSubscriptionsUI() {
    calculateSubMetrics();
    switchSubTab(currentSubTab);
}

function calculateSubMetrics() {
    const pendingList = subscriptionRequests.filter(r => r.status === 'pending');
    const pendingCount = pendingList.length;

    const badge = document.getElementById('subPendingBadge');
    if (badge) {
        badge.textContent = pendingCount;
        badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }
    const tabBadge = document.getElementById('subPendingTabBadge');
    if (tabBadge) tabBadge.textContent = pendingCount;

    const subDocs = Object.values(subscriptionsMap);
    const totalCount = subDocs.length;
    let activeCount = 0;
    let expiredCount = 0;
    let suspendedCount = 0;
    let totalRevenue = 0;

    const now = new Date();

    subDocs.forEach(sub => {
        const isExp = sub.expiryDate && (sub.expiryDate.toDate ? sub.expiryDate.toDate() : new Date(sub.expiryDate)) < now;
        if (sub.status === 'active' && !isExp) {
            activeCount++;
            totalRevenue += (sub.amount || 149);
        } else if (sub.status === 'expired' || (sub.status === 'active' && isExp)) {
            expiredCount++;
        } else if (sub.status === 'suspended' || sub.status === 'rejected') {
            suspendedCount++;
        }
    });

    document.getElementById('subMetricTotal').textContent = totalCount;
    document.getElementById('subMetricActive').textContent = activeCount;
    document.getElementById('subMetricPending').textContent = pendingCount;
    document.getElementById('subMetricExpired').textContent = expiredCount;
    document.getElementById('subMetricSuspended').textContent = suspendedCount;
    document.getElementById('subMetricRevenue').textContent = `₹${totalRevenue.toLocaleString()}`;
}

function switchSubTab(tabName) {
    currentSubTab = tabName;

    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-secondary');
    });
    const activeBtn = document.getElementById(`subTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Btn`);
    if (activeBtn) {
        activeBtn.classList.remove('btn-secondary');
        activeBtn.classList.add('btn-primary', 'active');
    }

    document.querySelectorAll('.sub-tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    const filterCard = document.getElementById('subFilterCard');
    if (tabName === 'settings') {
        if (filterCard) filterCard.classList.add('hidden');
        document.getElementById('subContentSettings')?.classList.remove('hidden');
        populateSubscriptionSettingsForm();
    } else {
        if (filterCard) filterCard.classList.remove('hidden');
        if (tabName === 'pending') {
            document.getElementById('subContentPending')?.classList.remove('hidden');
            renderSubPendingTable();
        } else if (tabName === 'active') {
            document.getElementById('subContentActive')?.classList.remove('hidden');
            renderSubActiveTable();
        } else if (tabName === 'expired') {
            document.getElementById('subContentExpired')?.classList.remove('hidden');
            renderSubExpiredTable();
        } else if (tabName === 'rejected') {
            document.getElementById('subContentRejected')?.classList.remove('hidden');
            renderSubRejectedTable();
        } else if (tabName === 'history') {
            document.getElementById('subContentHistory')?.classList.remove('hidden');
            renderSubHistoryTable();
        }
    }
}

function filterSubTable() {
    switchSubTab(currentSubTab);
}

function getSubSearchTerm() {
    return (document.getElementById('subSearchInput')?.value || '').toLowerCase().trim();
}

function getSubDateFilter() {
    return document.getElementById('subDateFilter')?.value || '';
}

function renderSubPendingTable() {
    const tbody = document.getElementById('subPendingTableBody');
    if (!tbody) return;

    const searchTerm = getSubSearchTerm();
    const dateFilter = getSubDateFilter();

    let list = subscriptionRequests.filter(r => r.status === 'pending');

    if (searchTerm) {
        list = list.filter(r => 
            (r.name && r.name.toLowerCase().includes(searchTerm)) ||
            (r.email && r.email.toLowerCase().includes(searchTerm)) ||
            (r.uid && r.uid.toLowerCase().includes(searchTerm)) ||
            (r.utr && r.utr.toLowerCase().includes(searchTerm))
        );
    }

    if (dateFilter) {
        list = list.filter(r => {
            if (!r.submittedAt) return false;
            const d = r.submittedAt.toDate ? r.submittedAt.toDate() : new Date(r.submittedAt);
            return d.toISOString().split('T')[0] === dateFilter;
        });
    }

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-secondary);">No pending subscription requests found.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(r => {
        const submittedDateStr = r.submittedAt
            ? (r.submittedAt.toDate ? r.submittedAt.toDate().toLocaleString() : new Date(r.submittedAt).toLocaleString())
            : 'Recent';

        return `
            <tr>
                <td>
                    <div style="font-weight: 600;">${r.name || 'User'}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${r.email || r.uid}</div>
                </td>
                <td><span class="font-mono" style="color: var(--gold-color); font-weight: 700;">${r.utr}</span></td>
                <td>₹${r.amount || 149}</td>
                <td style="font-size: 13px;">${submittedDateStr}</td>
                <td><span class="badge badge-warning">Pending Review</span></td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-sm" style="background: #4caf50; color: white;" onclick="openApproveSubModal('${r.id}', '${r.uid}', '${escapeHtml(r.name || '')}', '${escapeHtml(r.email || '')}', '${r.utr}', ${r.amount || 149})">Approve</button>
                        <button class="btn btn-sm btn-danger" onclick="openRejectSubModal('${r.id}', '${r.uid}', '${escapeHtml(r.name || '')}', '${r.utr}')">Reject</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderSubActiveTable() {
    const tbody = document.getElementById('subActiveTableBody');
    if (!tbody) return;

    const searchTerm = getSubSearchTerm();
    const now = new Date();

    let subList = Object.values(subscriptionsMap).filter(s => {
        const isExp = s.expiryDate && (s.expiryDate.toDate ? s.expiryDate.toDate() : new Date(s.expiryDate)) < now;
        return s.status === 'active' && !isExp;
    });

    if (searchTerm) {
        subList = subList.filter(s => {
            const userMeta = getUserDetails(s.uid, s.name || s.userName, s.email || s.userEmail);
            return (
                (s.uid && s.uid.toLowerCase().includes(searchTerm)) ||
                (userMeta.name && userMeta.name.toLowerCase().includes(searchTerm)) ||
                (userMeta.email && userMeta.email.toLowerCase().includes(searchTerm)) ||
                (s.latestUTR && s.latestUTR.toLowerCase().includes(searchTerm)) ||
                (s.planName && s.planName.toLowerCase().includes(searchTerm))
            );
        });
    }

    if (subList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-secondary);">No active subscribers found.</td></tr>`;
        return;
    }

    tbody.innerHTML = subList.map(s => {
        const expDate = s.expiryDate ? (s.expiryDate.toDate ? s.expiryDate.toDate() : new Date(s.expiryDate)) : null;
        const expStr = expDate ? expDate.toLocaleDateString() : 'N/A';
        const daysLeft = expDate ? Math.max(0, Math.ceil((expDate - now) / (1000 * 60 * 60 * 24))) : 0;
        const userMeta = getUserDetails(s.uid, s.name || s.userName, s.email || s.userEmail);

        return `
            <tr>
                <td>
                    <div style="font-weight: 600;">${escapeHtml(userMeta.name)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(userMeta.email)}</div>
                </td>
                <td>${s.planName || 'Monthly'} (₹${s.amount || 149})</td>
                <td><span class="font-mono" style="color: var(--gold-color);">${s.latestUTR || '-'}</span></td>
                <td>${expStr}</td>
                <td><span class="badge badge-success">${daysLeft} Days</span></td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-sm btn-secondary" onclick="openExtendSubModal('${s.uid}', '${escapeHtml(userMeta.name)}', '${escapeHtml(userMeta.email)}', '${expDate ? expDate.toISOString().split('T')[0] : ''}')">Extend</button>
                        <button class="btn btn-sm btn-danger" onclick="toggleSuspendSubscription('${s.uid}', 'active')">Suspend</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderSubExpiredTable() {
    const tbody = document.getElementById('subExpiredTableBody');
    if (!tbody) return;

    const searchTerm = getSubSearchTerm();
    const now = new Date();

    let list = Object.values(subscriptionsMap).filter(s => {
        const isExp = s.expiryDate && (s.expiryDate.toDate ? s.expiryDate.toDate() : new Date(s.expiryDate)) < now;
        return s.status === 'expired' || (s.status === 'active' && isExp);
    });

    if (searchTerm) {
        list = list.filter(s => {
            const userMeta = getUserDetails(s.uid, s.name || s.userName, s.email || s.userEmail);
            return (
                (s.uid && s.uid.toLowerCase().includes(searchTerm)) ||
                (userMeta.name && userMeta.name.toLowerCase().includes(searchTerm)) ||
                (userMeta.email && userMeta.email.toLowerCase().includes(searchTerm)) ||
                (s.latestUTR && s.latestUTR.toLowerCase().includes(searchTerm))
            );
        });
    }

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-secondary);">No expired subscriptions found.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(s => {
        const expDate = s.expiryDate ? (s.expiryDate.toDate ? s.expiryDate.toDate() : new Date(s.expiryDate)) : null;
        const expStr = expDate ? expDate.toLocaleDateString() : 'Expired';
        const userMeta = getUserDetails(s.uid, s.name || s.userName, s.email || s.userEmail);

        return `
            <tr>
                <td>
                    <div style="font-weight: 600;">${escapeHtml(userMeta.name)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(userMeta.email)}</div>
                </td>
                <td>${s.planName || 'Monthly'}</td>
                <td><span class="font-mono">${s.latestUTR || '-'}</span></td>
                <td><span class="badge badge-danger">${expStr}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="openExtendSubModal('${s.uid}', '${escapeHtml(userMeta.name)}', '${escapeHtml(userMeta.email)}', '${new Date().toISOString().split('T')[0]}')">Renew / Extend</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderSubRejectedTable() {
    const tbody = document.getElementById('subRejectedTableBody');
    if (!tbody) return;

    const searchTerm = getSubSearchTerm();

    let list = subscriptionRequests.filter(r => r.status === 'rejected');
    const suspendedSubs = Object.values(subscriptionsMap).filter(s => s.status === 'suspended');

    if (searchTerm) {
        list = list.filter(r => {
            const userMeta = getUserDetails(r.uid, r.name, r.email);
            return (
                (userMeta.name && userMeta.name.toLowerCase().includes(searchTerm)) ||
                (userMeta.email && userMeta.email.toLowerCase().includes(searchTerm)) ||
                (r.utr && r.utr.toLowerCase().includes(searchTerm))
            );
        });
    }

    if (list.length === 0 && suspendedSubs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-secondary);">No rejected or suspended records found.</td></tr>`;
        return;
    }

    let html = list.map(r => {
        const userMeta = getUserDetails(r.uid, r.name, r.email);
        return `
        <tr>
            <td>
                <div style="font-weight: 600;">${escapeHtml(userMeta.name)}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(userMeta.email)}</div>
            </td>
            <td><span class="badge badge-danger">Rejected Request</span></td>
            <td>
                <div>Reason: ${r.rejectionReason || 'Invalid UTR'}</div>
                ${r.adminRemark ? `<div style="font-size: 12px; color: var(--text-secondary);">Note: ${r.adminRemark}</div>` : ''}
            </td>
            <td>${r.reviewedAt ? (r.reviewedAt.toDate ? r.reviewedAt.toDate().toLocaleDateString() : new Date(r.reviewedAt).toLocaleDateString()) : 'Recent'}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="reopenPaymentFlow('${r.id}', '${r.uid}')">Re-open Request</button>
            </td>
        </tr>
    `;
    }).join('');

    html += suspendedSubs.map(s => {
        const userMeta = getUserDetails(s.uid, s.name || s.userName, s.email || s.userEmail);
        return `
        <tr>
            <td>
                <div style="font-weight: 600;">${escapeHtml(userMeta.name)}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(userMeta.email)}</div>
            </td>
            <td><span class="badge badge-danger" style="background: #e53935;">Account Suspended</span></td>
            <td>Admin manually suspended access</td>
            <td>${s.updatedAt ? (s.updatedAt.toDate ? s.updatedAt.toDate().toLocaleDateString() : new Date(s.updatedAt).toLocaleDateString()) : 'Recent'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="toggleSuspendSubscription('${s.uid}', 'suspended')">Re-activate</button>
            </td>
        </tr>
    `;
    }).join('');

    tbody.innerHTML = html;
}

function renderSubHistoryTable() {
    const tbody = document.getElementById('subHistoryTableBody');
    if (!tbody) return;

    if (subscriptionHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-secondary);">No history log entries recorded.</td></tr>`;
        return;
    }

    tbody.innerHTML = subscriptionHistory.map(h => {
        const timeStr = h.performedAt ? (h.performedAt.toDate ? h.performedAt.toDate().toLocaleString() : new Date(h.performedAt).toLocaleString()) : 'Recent';
        const userMeta = getUserDetails(h.uid, h.name || h.userName, h.email || h.userEmail);

        return `
            <tr>
                <td style="font-size: 12px; font-family: var(--font-mono);">${timeStr}</td>
                <td>
                    <div style="font-weight: 600;">${escapeHtml(userMeta.name)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(userMeta.email)}</div>
                </td>
                <td><span class="badge ${h.action === 'approved' ? 'badge-success' : (h.action === 'rejected' ? 'badge-danger' : 'badge-warning')}">${h.action.toUpperCase()}</span></td>
                <td style="font-size: 12px;">${h.previousStatus || '-'} ➔ <strong>${h.newStatus || '-'}</strong></td>
                <td style="font-size: 12px;">₹${h.amount || '-'} / <span class="font-mono">${h.utr || '-'}</span></td>
                <td style="font-size: 12px;">${h.performedBy || 'System/Admin'}</td>
                <td style="font-size: 12px; color: var(--text-secondary);">${h.remark || '-'}</td>
            </tr>
        `;
    }).join('');
}

function openApproveSubModal(requestId, uid, userName, userEmail, utr, amount) {
    document.getElementById('approveRequestId').value = requestId;
    document.getElementById('approveUid').value = uid;
    document.getElementById('approveUserName').textContent = userName || uid;
    document.getElementById('approveUserEmail').textContent = userEmail || '-';
    document.getElementById('approveUtrText').textContent = utr;
    document.getElementById('approveAmount').textContent = amount;
    document.getElementById('approveAdminRemark').value = '';

    document.getElementById('approveSubModal').classList.remove('hidden');
}

function closeApproveSubModal() {
    document.getElementById('approveSubModal').classList.add('hidden');
}

function confirmApproveSubscription(event) {
    event.preventDefault();
    const requestId = document.getElementById('approveRequestId').value;
    const uid = document.getElementById('approveUid').value;
    const extensionMode = document.getElementById('approveExtensionMode').value;
    const durationDays = parseInt(document.getElementById('approveDurationDays').value) || 30;
    const adminRemark = document.getElementById('approveAdminRemark').value.trim();

    const currentUser = firebase.auth().currentUser;
    const adminActor = currentUser ? (currentUser.email || currentUser.uid) : 'SuperAdmin';

    let startDate = new Date();
    let expiryDate = new Date();

    const existingSub = subscriptionsMap[uid];
    const now = new Date();
    if (extensionMode === 'from_existing' && existingSub && existingSub.expiryDate) {
        const currentExpiry = existingSub.expiryDate.toDate ? existingSub.expiryDate.toDate() : new Date(existingSub.expiryDate);
        if (currentExpiry > now) {
            expiryDate = new Date(currentExpiry.getTime() + (durationDays * 24 * 60 * 60 * 1000));
        } else {
            expiryDate = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
        }
    } else {
        expiryDate = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
    }

    const batch = db.batch();

    const reqRef = db.collection('subscriptionRequests').doc(requestId);
    batch.update(reqRef, {
        status: 'approved',
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
        reviewedBy: adminActor,
        adminRemark: adminRemark,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    const subRef = db.collection('subscriptions').doc(uid);
    batch.set(subRef, {
        uid: uid,
        tenantId: 'default',
        planId: 'monthly_149',
        planName: subscriptionSettings.planName || 'Monthly',
        amount: subscriptionSettings.monthlyPrice || 149,
        status: 'active',
        paymentMethod: 'UPI',
        startDate: firebase.firestore.Timestamp.fromDate(startDate),
        expiryDate: firebase.firestore.Timestamp.fromDate(expiryDate),
        approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        approvedBy: adminActor,
        remarks: adminRemark,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const histRef = db.collection('subscriptionHistory').doc();
    batch.set(histRef, {
        uid: uid,
        tenantId: 'default',
        requestId: requestId,
        planId: 'monthly_149',
        amount: subscriptionSettings.monthlyPrice || 149,
        action: 'approved',
        previousStatus: existingSub ? existingSub.status : 'pending',
        newStatus: 'active',
        startDate: firebase.firestore.Timestamp.fromDate(startDate),
        expiryDate: firebase.firestore.Timestamp.fromDate(expiryDate),
        performedBy: adminActor,
        performedAt: firebase.firestore.FieldValue.serverTimestamp(),
        remark: adminRemark || 'Subscription payment approved by Super Admin.'
    });

    const auditRef = db.collection('auditLogs').doc();
    batch.set(auditRef, {
        actorUid: adminActor,
        actorRole: 'admin',
        action: 'approve_subscription',
        targetType: 'user',
        targetId: uid,
        reason: adminRemark,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    batch.commit().then(() => {
        showToast('Subscription approved and activated successfully!', 'success');
        closeApproveSubModal();
        loadSubscriptionsData();
    }).catch(err => {
        console.error('Error approving subscription:', err);
        showToast('Failed to approve subscription: ' + err.message, 'error');
    });
}

function openRejectSubModal(requestId, uid, userName, utr) {
    document.getElementById('rejectRequestId').value = requestId;
    document.getElementById('rejectUid').value = uid;
    document.getElementById('rejectUserName').textContent = userName || uid;
    document.getElementById('rejectUtrText').textContent = utr;
    document.getElementById('rejectAdminRemark').value = '';

    document.getElementById('rejectSubModal').classList.remove('hidden');
}

function closeRejectSubModal() {
    document.getElementById('rejectSubModal').classList.add('hidden');
}

function confirmRejectSubscription(event) {
    event.preventDefault();
    const requestId = document.getElementById('rejectRequestId').value;
    const uid = document.getElementById('rejectUid').value;
    const reason = document.getElementById('rejectReasonSelect').value;
    const adminRemark = document.getElementById('rejectAdminRemark').value.trim();

    const currentUser = firebase.auth().currentUser;
    const adminActor = currentUser ? (currentUser.email || currentUser.uid) : 'SuperAdmin';

    const batch = db.batch();

    const reqRef = db.collection('subscriptionRequests').doc(requestId);
    batch.update(reqRef, {
        status: 'rejected',
        rejectionReason: reason,
        adminRemark: adminRemark,
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
        reviewedBy: adminActor,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    const subRef = db.collection('subscriptions').doc(uid);
    batch.set(subRef, {
        status: 'rejected',
        remarks: `Rejected: ${reason}. ${adminRemark}`,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const histRef = db.collection('subscriptionHistory').doc();
    batch.set(histRef, {
        uid: uid,
        requestId: requestId,
        action: 'rejected',
        previousStatus: 'pending',
        newStatus: 'rejected',
        performedBy: adminActor,
        performedAt: firebase.firestore.FieldValue.serverTimestamp(),
        remark: `${reason}: ${adminRemark}`
    });

    const auditRef = db.collection('auditLogs').doc();
    batch.set(auditRef, {
        actorUid: adminActor,
        action: 'reject_subscription',
        targetType: 'user',
        targetId: uid,
        reason: reason,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    batch.commit().then(() => {
        showToast('Payment request rejected.', 'info');
        closeRejectSubModal();
        loadSubscriptionsData();
    }).catch(err => {
        console.error('Error rejecting subscription:', err);
        showToast('Failed to reject subscription: ' + err.message, 'error');
    });
}

function openExtendSubModal(uid, userName, userEmail, currentExpiry) {
    document.getElementById('extendUid').value = uid;
    document.getElementById('extendUserName').textContent = userName || uid;
    document.getElementById('extendUserEmail').textContent = userEmail || '-';
    
    const defaultDate = currentExpiry || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    document.getElementById('extendCustomExpiryDate').value = defaultDate;
    document.getElementById('extendAdminRemark').value = '';

    document.getElementById('extendSubModal').classList.remove('hidden');
}

function closeExtendSubModal() {
    document.getElementById('extendSubModal').classList.add('hidden');
}

function addDaysToExpiry(days) {
    const input = document.getElementById('extendCustomExpiryDate');
    const currentVal = input.value ? new Date(input.value) : new Date();
    const newDate = new Date(currentVal.getTime() + days * 24 * 60 * 60 * 1000);
    input.value = newDate.toISOString().split('T')[0];
}

function confirmExtendSubscription(event) {
    event.preventDefault();
    const uid = document.getElementById('extendUid').value;
    const dateStr = document.getElementById('extendCustomExpiryDate').value;
    const adminRemark = document.getElementById('extendAdminRemark').value.trim();

    if (!dateStr) {
        showToast('Please select a valid expiry date', 'error');
        return;
    }

    const newExpiryDate = new Date(dateStr + 'T23:59:59');
    const currentUser = firebase.auth().currentUser;
    const adminActor = currentUser ? (currentUser.email || currentUser.uid) : 'SuperAdmin';

    const batch = db.batch();

    const subRef = db.collection('subscriptions').doc(uid);
    batch.set(subRef, {
        status: 'active',
        expiryDate: firebase.firestore.Timestamp.fromDate(newExpiryDate),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const histRef = db.collection('subscriptionHistory').doc();
    batch.set(histRef, {
        uid: uid,
        action: 'extended',
        newStatus: 'active',
        expiryDate: firebase.firestore.Timestamp.fromDate(newExpiryDate),
        performedBy: adminActor,
        performedAt: firebase.firestore.FieldValue.serverTimestamp(),
        remark: adminRemark || 'Expiry date extended by Super Admin.'
    });

    batch.commit().then(() => {
        showToast('Subscription extended successfully!', 'success');
        closeExtendSubModal();
        loadSubscriptionsData();
    }).catch(err => {
        console.error('Error extending subscription:', err);
        showToast('Failed to extend subscription: ' + err.message, 'error');
    });
}

function toggleSuspendSubscription(uid, currentStatus) {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    const actionText = newStatus === 'suspended' ? 'Suspend' : 'Reactivate';

    if (!confirm(`Are you sure you want to ${actionText} subscription access for user UID: ${uid}?`)) return;

    const currentUser = firebase.auth().currentUser;
    const adminActor = currentUser ? (currentUser.email || currentUser.uid) : 'SuperAdmin';

    const batch = db.batch();

    const subRef = db.collection('subscriptions').doc(uid);
    const updateData = {
        status: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (newStatus === 'suspended') {
        updateData.suspendedAt = firebase.firestore.FieldValue.serverTimestamp();
        updateData.suspendedBy = adminActor;
    }
    batch.set(subRef, updateData, { merge: true });

    const histRef = db.collection('subscriptionHistory').doc();
    batch.set(histRef, {
        uid: uid,
        action: newStatus,
        previousStatus: currentStatus,
        newStatus: newStatus,
        performedBy: adminActor,
        performedAt: firebase.firestore.FieldValue.serverTimestamp(),
        remark: `Subscription status set to ${newStatus} by admin.`
    });

    batch.commit().then(() => {
        showToast(`User subscription ${newStatus}!`, 'success');
        loadSubscriptionsData();
    }).catch(err => {
        console.error('Error updating subscription status:', err);
        showToast('Failed to update subscription status: ' + err.message, 'error');
    });
}

function reopenPaymentFlow(requestId, uid) {
    if (!confirm(`Re-open payment request for user ${uid}? This will allow the user to resubmit.`)) return;

    db.collection('subscriptionRequests').doc(requestId).update({
        status: 'pending',
        reopenedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        db.collection('subscriptions').doc(uid).update({ status: 'pending' });
        showToast('Payment request re-opened', 'info');
        loadSubscriptionsData();
    });
}

function populateSubscriptionSettingsForm() {
    const gateToggle = document.getElementById('settingSubGateToggle');
    if (gateToggle) gateToggle.checked = subscriptionSettings.subscriptionGateEnabled || false;

    const mainToggle = document.getElementById('settingSubMaintenanceToggle');
    if (mainToggle) mainToggle.checked = subscriptionSettings.maintenanceMode || false;

    const planInput = document.getElementById('settingPlanName');
    if (planInput) planInput.value = subscriptionSettings.planName || 'Monthly Subscription';

    const priceInput = document.getElementById('settingMonthlyPrice');
    if (priceInput) priceInput.value = subscriptionSettings.monthlyPrice || 149;

    const durInput = document.getElementById('settingDurationDays');
    if (durInput) durInput.value = subscriptionSettings.durationDays || 30;

    const upiInput = document.getElementById('settingUpiId');
    if (upiInput) upiInput.value = subscriptionSettings.upiId || 'entrykaro@upi';

    const qrInput = document.getElementById('settingQrImageUrl');
    if (qrInput) qrInput.value = subscriptionSettings.qrImageUrl || '';

    const instInput = document.getElementById('settingPaymentInstructions');
    if (instInput) instInput.value = subscriptionSettings.paymentInstructions || '';

    const minInput = document.getElementById('settingUtrMinLength');
    if (minInput) minInput.value = subscriptionSettings.utrMinLength || 10;

    const maxInput = document.getElementById('settingUtrMaxLength');
    if (maxInput) maxInput.value = subscriptionSettings.utrMaxLength || 22;

    const remInput = document.getElementById('settingReminderDays');
    if (remInput) remInput.value = subscriptionSettings.renewalReminderDays || 5;

    const graceInput = document.getElementById('settingGracePeriod');
    if (graceInput) graceInput.value = subscriptionSettings.gracePeriodDays || 0;
}

function saveSubscriptionSettings() {
    const updatedSettings = {
        subscriptionGateEnabled: document.getElementById('settingSubGateToggle').checked,
        maintenanceMode: document.getElementById('settingSubMaintenanceToggle').checked,
        planName: document.getElementById('settingPlanName').value.trim() || 'Monthly',
        monthlyPrice: parseFloat(document.getElementById('settingMonthlyPrice').value) || 149,
        durationDays: parseInt(document.getElementById('settingDurationDays').value) || 30,
        upiId: document.getElementById('settingUpiId').value.trim() || 'entrykaro@upi',
        qrImageUrl: document.getElementById('settingQrImageUrl').value.trim(),
        paymentInstructions: document.getElementById('settingPaymentInstructions').value.trim(),
        utrMinLength: parseInt(document.getElementById('settingUtrMinLength').value) || 10,
        utrMaxLength: parseInt(document.getElementById('settingUtrMaxLength').value) || 22,
        renewalReminderDays: parseInt(document.getElementById('settingReminderDays').value) || 5,
        gracePeriodDays: parseInt(document.getElementById('settingGracePeriod').value) || 0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const currentUser = firebase.auth().currentUser;
    const adminActor = currentUser ? (currentUser.email || currentUser.uid) : 'SuperAdmin';

    const batch = db.batch();

    batch.set(db.collection('appSettings').doc('subscription'), updatedSettings, { merge: true });
    batch.set(db.collection('settings').doc('subscription'), updatedSettings, { merge: true });

    const auditRef = db.collection('auditLogs').doc();
    batch.set(auditRef, {
        actorUid: adminActor,
        action: 'update_subscription_settings',
        targetType: 'settings',
        targetId: 'subscription',
        after: updatedSettings,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    batch.commit().then(() => {
        subscriptionSettings = { ...subscriptionSettings, ...updatedSettings };
        showToast('Subscription settings saved successfully!', 'success');
    }).catch(err => {
        console.error('Error saving subscription settings:', err);
        showToast('Failed to save settings: ' + err.message, 'error');
    });
}

// Bind Subscription functions to window
window.loadSubscriptionsData = loadSubscriptionsData;
window.switchSubTab = switchSubTab;
window.filterSubTable = filterSubTable;
window.openApproveSubModal = openApproveSubModal;
window.closeApproveSubModal = closeApproveSubModal;
window.confirmApproveSubscription = confirmApproveSubscription;
window.openRejectSubModal = openRejectSubModal;
window.closeRejectSubModal = closeRejectSubModal;
window.confirmRejectSubscription = confirmRejectSubscription;
window.openExtendSubModal = openExtendSubModal;
window.closeExtendSubModal = closeExtendSubModal;
window.addDaysToExpiry = addDaysToExpiry;
window.confirmExtendSubscription = confirmExtendSubscription;
window.toggleSuspendSubscription = toggleSuspendSubscription;
window.reopenPaymentFlow = reopenPaymentFlow;
window.saveSubscriptionSettings = saveSubscriptionSettings;

// ============================================
// SELF TRANSFER MANAGEMENT
// ============================================

let transferRequestsList = [];
let currentStTab = 'pending';
let stListenersActive = false;

function loadSelfTransfersData() {
    console.log('Loading Self Transfers Data...');
    if (typeof users === 'undefined' || !users || users.length === 0) {
        loadUsers();
    }
    initSelfTransferListeners();
}

function initSelfTransferListeners() {
    if (stListenersActive) return;
    stListenersActive = true;

    db.collection('transferRequests')
      .orderBy('submittedAt', 'desc')
      .onSnapshot(snapshot => {
          transferRequestsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          renderSelfTransfersUI();
      }, err => {
          console.error('Error listening to transferRequests:', err);
      });
}

function renderSelfTransfersUI() {
    calculateStMetrics();
    switchStTab(currentStTab);
}

function calculateStMetrics() {
    const pendingRequests = transferRequestsList.filter(r => r.status === 'pending');
    const pendingCount = pendingRequests.length;
    const pendingAmount = pendingRequests.reduce((acc, r) => acc + (r.amount || 0), 0);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const approvedToday = transferRequestsList.filter(r => {
        if (r.status !== 'approved' || !r.reviewedAt) return false;
        const d = r.reviewedAt.toDate ? r.reviewedAt.toDate() : new Date(r.reviewedAt);
        return d.toISOString().split('T')[0] === todayStr;
    }).length;

    const rejectedToday = transferRequestsList.filter(r => {
        if (r.status !== 'rejected' || !r.reviewedAt) return false;
        const d = r.reviewedAt.toDate ? r.reviewedAt.toDate() : new Date(r.reviewedAt);
        return d.toISOString().split('T')[0] === todayStr;
    }).length;

    const totalTransferredAmount = transferRequestsList
        .filter(r => r.status === 'approved')
        .reduce((acc, r) => acc + (r.amount || 0), 0);

    // Update UI Badges & Metrics
    const pendingBadge = document.getElementById('stPendingTabBadge');
    if (pendingBadge) pendingBadge.textContent = pendingCount;

    const sidebarBadge = document.getElementById('selfTransferPendingBadge');
    if (sidebarBadge) {
        sidebarBadge.textContent = pendingCount;
        sidebarBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }

    const metricPending = document.getElementById('stMetricPending');
    if (metricPending) metricPending.textContent = `${pendingCount} (₹${pendingAmount.toFixed(0)})`;

    const metricApprovedToday = document.getElementById('stMetricApprovedToday');
    if (metricApprovedToday) metricApprovedToday.textContent = approvedToday;

    const metricRejectedToday = document.getElementById('stMetricRejectedToday');
    if (metricRejectedToday) metricRejectedToday.textContent = rejectedToday;

    const metricTotalAmount = document.getElementById('stMetricTotalAmount');
    if (metricTotalAmount) metricTotalAmount.textContent = formatCurrency(totalTransferredAmount);
}

function switchStTab(tab) {
    currentStTab = tab;
    document.querySelectorAll('.st-tab-btn').forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-secondary');
    });

    const activeBtn = document.getElementById(`stTab${tab.charAt(0).toUpperCase() + tab.slice(1)}Btn`);
    if (activeBtn) {
        activeBtn.classList.remove('btn-secondary');
        activeBtn.classList.add('btn-primary', 'active');
    }

    filterStTable();
}

function filterStTable() {
    const searchInput = document.getElementById('stSearchInput');
    const dateInput = document.getElementById('stDateFilter');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const dateFilter = dateInput ? dateInput.value : '';

    let list = [...transferRequestsList];

    // Filter by tab
    if (currentStTab === 'pending') {
        list = list.filter(r => r.status === 'pending');
    } else if (currentStTab === 'approved') {
        list = list.filter(r => r.status === 'approved');
    } else if (currentStTab === 'rejected') {
        list = list.filter(r => r.status === 'rejected');
    }

    // Filter by search
    if (searchTerm) {
        list = list.filter(r => {
            const senderMeta = getUserDetails(r.senderUid, r.senderName, r.senderEmail);
            const recipientMeta = getUserDetails(r.recipientUid, r.recipientName, r.recipientEmail);
            return (
                (r.id && r.id.toLowerCase().includes(searchTerm)) ||
                (senderMeta.name && senderMeta.name.toLowerCase().includes(searchTerm)) ||
                (senderMeta.email && senderMeta.email.toLowerCase().includes(searchTerm)) ||
                (recipientMeta.name && recipientMeta.name.toLowerCase().includes(searchTerm)) ||
                (recipientMeta.email && recipientMeta.email.toLowerCase().includes(searchTerm)) ||
                (r.note && r.note.toLowerCase().includes(searchTerm))
            );
        });
    }

    // Filter by date
    if (dateFilter) {
        list = list.filter(r => {
            if (!r.submittedAt) return false;
            const d = r.submittedAt.toDate ? r.submittedAt.toDate() : new Date(r.submittedAt);
            return d.toISOString().split('T')[0] === dateFilter;
        });
    }

    renderStTableBody(list);
}

function renderStTableBody(list) {
    const tbody = document.getElementById('stTableBody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-secondary);">No self transfer requests found.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(r => {
        const submittedDateStr = r.submittedAt
            ? (r.submittedAt.toDate ? r.submittedAt.toDate().toLocaleString() : new Date(r.submittedAt).toLocaleString())
            : 'Recent';

        const senderMeta = getUserDetails(r.senderUid, r.senderName, r.senderEmail);
        const recipientMeta = getUserDetails(r.recipientUid, r.recipientName, r.recipientEmail);

        let badgeClass = 'badge-warning';
        let statusLabel = 'Pending Review';
        if (r.status === 'approved') {
            badgeClass = 'badge-success';
            statusLabel = 'Approved';
        } else if (r.status === 'rejected') {
            badgeClass = 'badge-danger';
            statusLabel = 'Rejected';
        }

        return `
            <tr>
                <td style="font-size: 12px; font-family: var(--font-mono);">${submittedDateStr}</td>
                <td style="font-size: 12px; font-family: var(--font-mono); color: var(--gold-color);">${r.id.substring(0, 10)}...</td>
                <td>
                    <div style="font-weight: 600;">${escapeHtml(senderMeta.name)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(senderMeta.email)}</div>
                </td>
                <td>
                    <div style="font-weight: 600;">${escapeHtml(recipientMeta.name)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(recipientMeta.email)}</div>
                </td>
                <td><strong style="color: var(--gold-color);">₹${(r.amount || 0).toFixed(2)}</strong></td>
                <td style="font-size: 12px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(r.note || '-')}</td>
                <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
                <td>
                    ${r.status === 'pending' ? `
                        <div style="display: flex; gap: 6px;">
                            <button class="btn btn-sm" style="background: #4caf50; color: white;" onclick="openApproveStModal('${r.id}', '${escapeHtml(senderMeta.name)} (${escapeHtml(senderMeta.email)})', '${escapeHtml(recipientMeta.name)} (${escapeHtml(recipientMeta.email)})', ${r.amount || 0}, '${escapeHtml(r.note || '')}')">Approve</button>
                            <button class="btn btn-sm btn-danger" onclick="openRejectStModal('${r.id}', '${escapeHtml(senderMeta.name)} (${escapeHtml(senderMeta.email)})', '${escapeHtml(recipientMeta.name)} (${escapeHtml(recipientMeta.email)})', ${r.amount || 0})">Reject</button>
                        </div>
                    ` : `
                        <span style="font-size: 11px; color: var(--text-secondary);">${r.reviewedBy ? 'By ' + r.reviewedBy : '-'}</span>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

function openApproveStModal(requestId, senderInfo, recipientInfo, amount, note) {
    document.getElementById('approveStRequestId').value = requestId;
    document.getElementById('approveStSenderText').textContent = senderInfo;
    document.getElementById('approveStRecipientText').textContent = recipientInfo;
    document.getElementById('approveStAmountText').textContent = `₹${amount.toFixed(2)}`;
    document.getElementById('approveStNoteText').textContent = note || '-';
    document.getElementById('approveStAdminRemark').value = '';

    document.getElementById('approveStModal').classList.remove('hidden');
}

function closeApproveStModal() {
    document.getElementById('approveStModal').classList.add('hidden');
}

function confirmApproveSt(event) {
    event.preventDefault();
    const requestId = document.getElementById('approveStRequestId').value;
    const adminRemark = document.getElementById('approveStAdminRemark').value.trim();

    const req = transferRequestsList.find(r => r.id === requestId);
    if (!req) {
        showToast('Transfer request not found.', 'error');
        return;
    }

    if (req.status !== 'pending') {
        showToast('Request is no longer pending.', 'warning');
        closeApproveStModal();
        return;
    }

    const currentUser = firebase.auth().currentUser;
    const adminActor = currentUser ? (currentUser.email || currentUser.uid) : 'SuperAdmin';

    const batch = db.batch();

    // 1. Update transfer request status
    const reqRef = db.collection('transferRequests').doc(requestId);
    batch.update(reqRef, {
        status: 'approved',
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
        reviewedBy: adminActor,
        reviewedRole: 'admin',
        adminRemark: adminRemark,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 2. Debit Sender Balance
    const senderRef = db.collection('users').doc(req.senderUid);
    batch.update(senderRef, {
        balance: firebase.firestore.FieldValue.increment(-req.amount),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 3. Credit Recipient Balance
    const recipientRef = db.collection('users').doc(req.recipientUid);
    batch.update(recipientRef, {
        balance: firebase.firestore.FieldValue.increment(req.amount),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 4. Create Paired Ledger Statements in receivedEntries / depositEntries
    const noteText = req.note ? ` | Note: ${req.note}` : '';
    const adminRemarkText = adminRemark ? ` | Admin: ${adminRemark}` : '';

    const senderEntryRef = db.collection('depositEntries').doc();
    batch.set(senderEntryRef, {
        userId: req.senderUid,
        amount: req.amount,
        type: 'self_transfer_out',
        utr: `ST-${requestId.substring(0, 8)}`,
        status: 'approved',
        timestamp: Date.now(),
        approvedAt: Date.now(),
        approvedBy: adminActor,
        remark: `Send to: ${req.recipientEmail}${noteText}${adminRemarkText}`,
        note: `Send to: ${req.recipientEmail}${noteText}${adminRemarkText}`
    });

    const recipientEntryRef = db.collection('receivedEntries').doc();
    batch.set(recipientEntryRef, {
        userId: req.recipientUid,
        amount: req.amount,
        type: 'self_transfer_in',
        utr: `ST-${requestId.substring(0, 8)}`,
        status: 'approved',
        timestamp: Date.now(),
        approvedAt: Date.now(),
        approvedBy: adminActor,
        remark: `Receive from: ${req.senderEmail}${noteText}${adminRemarkText}`,
        note: `Receive from: ${req.senderEmail}${noteText}${adminRemarkText}`
    });

    // 5. Create Audit Log
    const auditRef = db.collection('auditLogs').doc();
    batch.set(auditRef, {
        actorUid: adminActor,
        actorRole: 'admin',
        action: 'approve_self_transfer',
        targetType: 'transferRequest',
        targetId: requestId,
        amount: req.amount,
        senderUid: req.senderUid,
        recipientUid: req.recipientUid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    batch.commit().then(() => {
        showToast('Self transfer approved! Wallet balances updated.', 'success');
        closeApproveStModal();
        loadSelfTransfersData();
    }).catch(err => {
        console.error('Error approving self transfer:', err);
        showToast('Failed to approve transfer: ' + err.message, 'error');
    });
}

function openRejectStModal(requestId, senderInfo, recipientInfo, amount) {
    document.getElementById('rejectStRequestId').value = requestId;
    document.getElementById('rejectStSenderText').textContent = senderInfo;
    document.getElementById('rejectStRecipientText').textContent = recipientInfo;
    document.getElementById('rejectStAmountText').textContent = `₹${amount.toFixed(2)}`;
    document.getElementById('rejectStAdminRemark').value = '';

    document.getElementById('rejectStModal').classList.remove('hidden');
}

function closeRejectStModal() {
    document.getElementById('rejectStModal').classList.add('hidden');
}

function confirmRejectSt(event) {
    event.preventDefault();
    const requestId = document.getElementById('rejectStRequestId').value;
    const reason = document.getElementById('rejectStReasonSelect').value;
    const adminRemark = document.getElementById('rejectStAdminRemark').value.trim();

    const req = transferRequestsList.find(r => r.id === requestId);
    if (!req) {
        showToast('Transfer request not found.', 'error');
        return;
    }

    const currentUser = firebase.auth().currentUser;
    const adminActor = currentUser ? (currentUser.email || currentUser.uid) : 'SuperAdmin';

    const batch = db.batch();

    const reqRef = db.collection('transferRequests').doc(requestId);
    batch.update(reqRef, {
        status: 'rejected',
        rejectionReason: reason,
        adminRemark: adminRemark,
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
        reviewedBy: adminActor,
        reviewedRole: 'admin',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    const auditRef = db.collection('auditLogs').doc();
    batch.set(auditRef, {
        actorUid: adminActor,
        actorRole: 'admin',
        action: 'reject_self_transfer',
        targetType: 'transferRequest',
        targetId: requestId,
        reason: reason,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    batch.commit().then(() => {
        showToast('Self transfer request rejected.', 'info');
        closeRejectStModal();
        loadSelfTransfersData();
    }).catch(err => {
        console.error('Error rejecting self transfer:', err);
        showToast('Failed to reject transfer: ' + err.message, 'error');
    });
}

// Bind Self Transfer functions to window
window.loadSelfTransfersData = loadSelfTransfersData;
window.switchStTab = switchStTab;
window.filterStTable = filterStTable;
window.openApproveStModal = openApproveStModal;
window.closeApproveStModal = closeApproveStModal;
window.confirmApproveSt = confirmApproveSt;
window.openRejectStModal = openRejectStModal;
window.closeRejectStModal = closeRejectStModal;
window.confirmRejectSt = confirmRejectSt;

// ==========================================================================
// APP UPDATE MANAGEMENT
// ==========================================================================

async function loadAppUpdateData() {
    console.log('loadAppUpdateData called - populating initial UI');
    
    // 1. Immediately populate initial UI values synchronously so form is NEVER blank
    if (document.getElementById('updateVersionCode')) document.getElementById('updateVersionCode').value = 105;
    if (document.getElementById('updateVersionName')) document.getElementById('updateVersionName').value = '1.0.5';
    if (document.getElementById('updateMessageText')) document.getElementById('updateMessageText').value = 'A new version of Entry Karo is available. Please update to continue using the app.';
    if (document.getElementById('updateForceToggle')) document.getElementById('updateForceToggle').checked = true;

    try {
        // 2. Wrap Firestore fetch with a 3s timeout so it never hangs
        const fetchPromise = db.collection('appConfig').doc('android').get();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Firestore request timeout')), 3000)
        );

        const doc = await Promise.race([fetchPromise, timeoutPromise]);
        if (doc && doc.exists) {
            const data = doc.data();
            if (document.getElementById('updateVersionCode')) document.getElementById('updateVersionCode').value = data.latestVersionCode || 105;
            if (document.getElementById('updateVersionName')) document.getElementById('updateVersionName').value = data.versionName || '1.0.5';
            if (document.getElementById('updateDownloadUrl')) document.getElementById('updateDownloadUrl').value = data.downloadUrl || '';
            if (document.getElementById('updateMessageText')) document.getElementById('updateMessageText').value = data.updateMessage || '';
            if (document.getElementById('updateForceToggle')) document.getElementById('updateForceToggle').checked = data.forceUpdate !== false;

            // Live preview card updates
            if (document.getElementById('liveVersionCode')) document.getElementById('liveVersionCode').textContent = data.latestVersionCode || '100';
            if (document.getElementById('liveVersionName')) document.getElementById('liveVersionName').textContent = data.versionName || '1.0.0';
            
            const urlSpan = document.getElementById('liveDownloadUrl');
            const urlLink = document.getElementById('liveDownloadLink');
            if (urlSpan && urlLink) {
                if (data.downloadUrl) {
                    urlSpan.textContent = data.downloadUrl;
                    urlLink.href = data.downloadUrl;
                    urlLink.style.display = 'inline-flex';
                } else {
                    urlSpan.textContent = 'Not configured';
                    urlLink.style.display = 'none';
                }
            }

            if (document.getElementById('liveUpdateMessage')) {
                document.getElementById('liveUpdateMessage').textContent = data.updateMessage || 'No message set.';
            }

            const isForce = data.forceUpdate !== false;
            const forceBadge = document.getElementById('liveForceBadge');
            if (forceBadge) {
                forceBadge.textContent = isForce ? 'Force Update: ON' : 'Force Update: OFF';
                forceBadge.style.background = isForce ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)';
                forceBadge.style.color = isForce ? '#4caf50' : '#f44336';
                forceBadge.style.borderColor = isForce ? 'rgba(76, 175, 80, 0.4)' : 'rgba(244, 67, 54, 0.4)';
            }

            if (document.getElementById('liveUpdatedAt')) {
                if (data.updatedAt) {
                    const date = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
                    document.getElementById('liveUpdatedAt').textContent = date.toLocaleString();
                } else {
                    document.getElementById('liveUpdatedAt').textContent = 'Never';
                }
            }
        }
    } catch (err) {
        console.warn('Firestore fetch skipped or timed out, using form defaults:', err.message);
    }
}

async function handleAppUpdateSubmit(event) {
    event.preventDefault();
    const saveBtn = document.getElementById('saveAppUpdateBtn');
    
    const latestVersionCode = parseInt(document.getElementById('updateVersionCode').value);
    const versionName = document.getElementById('updateVersionName').value.trim();
    const downloadUrl = document.getElementById('updateDownloadUrl').value.trim();
    const updateMessage = document.getElementById('updateMessageText').value.trim();
    const forceUpdate = document.getElementById('updateForceToggle').checked;

    if (isNaN(latestVersionCode) || latestVersionCode <= 0) {
        showToast('error', 'Validation Error', 'Please enter a valid numeric Version Code.');
        return;
    }

    if (!versionName) {
        showToast('error', 'Validation Error', 'Please enter a Version Name (e.g. 1.0.5).');
        return;
    }

    if (!downloadUrl.startsWith('https://')) {
        showToast('error', 'Validation Error', 'Download URL must be a secure HTTPS link.');
        return;
    }

    if (!updateMessage) {
        showToast('error', 'Validation Error', 'Please enter an update message or release notes.');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="btn-loader"></span> Saving...';

    try {
        const updateData = {
            latestVersionCode: latestVersionCode,
            versionName: versionName,
            downloadUrl: downloadUrl,
            updateMessage: updateMessage,
            forceUpdate: forceUpdate,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // 1. Save to appConfig/android
        await db.collection('appConfig').doc('android').set(updateData, { merge: true });

        // 2. Log in auditLogs
        const adminUser = firebase.auth().currentUser;
        const adminEmail = adminUser ? adminUser.email : 'Admin';

        await db.collection('auditLogs').add({
            action: 'APP_UPDATE_PUBLISHED',
            details: `Published Android update ${versionName} (code: ${latestVersionCode}). Force update: ${forceUpdate ? 'ON' : 'OFF'}`,
            performedBy: adminEmail,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast('success', 'Published', 'App Update published successfully!');
        await loadAppUpdateData();
    } catch (err) {
        console.error('Error saving app update:', err);
        showToast('error', 'Error', 'Error publishing app update: ' + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> <span>Save & Publish Update</span>';
    }
}

// Bind to window
window.loadAppUpdateData = loadAppUpdateData;
window.handleAppUpdateSubmit = handleAppUpdateSubmit;



