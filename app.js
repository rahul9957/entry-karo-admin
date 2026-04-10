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
        console.log('Page shown:', page);
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
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No users found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = usersList.map(user => `
        <tr onclick="viewUser('${user.id}')" style="cursor: pointer;">
            <td>${user.email || 'N/A'}</td>
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
    
    renderUsersTable(filtered);
});

document.getElementById('userStatusFilter')?.addEventListener('change', () => {
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
                status: 'completed'
            })),
            ...depositsData.map(d => ({ 
                ...d, 
                amount: -d.amount, 
                transactionType: 'debit',
                description: `Deposit - ${d.utr || 'N/A'}`
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
    
    let filtered = transactions;
    if (filter === 'received') {
        filtered = transactions.filter(t => t.type === 'received');
        console.log('Filtered for received:', filtered.length);
    } else if (filter === 'deposit') {
        filtered = transactions.filter(t => t.type === 'deposit');
        console.log('Filtered for deposits:', filtered.length);
    } else {
        console.log('Showing all transactions:', filtered.length);
    }
    
    if (filtered.length === 0) {
        console.log('No transactions to display for filter:', filter);
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No transactions found</td></tr>`;
        return;
    }
    
    // Sort by timestamp DESCENDING (newest first)
    const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);
    
    // Calculate running balance from current balance backwards
    const user = window.currentStatementUser;
    const currentBalance = user?.balance || 0;
    
    // Calculate reverse running balance
    let runningBalance = currentBalance;
    const rows = [];
    
    // First pass: calculate balances from newest to oldest
    for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        const isCredit = t.transactionType === 'credit';
        
        rows.push({
            ...t,
            balanceAtThisPoint: runningBalance,
            isCredit: isCredit
        });
        
        // Reverse the transaction to get previous balance
        if (isCredit) {
            runningBalance -= t.amount;
        } else {
            runningBalance += Math.abs(t.amount);
        }
    }
    
    tbody.innerHTML = rows.map((t, index) => {
        const refNo = t.id ? t.id.substring(0, 12).toUpperCase() : `TXN${String(index + 1).padStart(6, '0')}`;
        
        return `
            <tr>
                <td class="col-date">${formatDate(t.timestamp)}</td>
                <td class="col-ref">${refNo}</td>
                <td class="col-desc">${t.description || t.note || t.utr || '-'}</td>
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
                    <td>${d.utr || '-'}</td>
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
        
        const tableData = sorted.map((t, idx) => {
            const isCredit = t.transactionType === 'credit';
            const refNo = t.id ? t.id.substring(0, 12).toUpperCase() : `TXN${String(idx + 1).padStart(6, '0')}`;
            
            return [
                new Date(t.timestamp).toLocaleString('en-IN'),
                refNo,
                t.description || t.note || t.utr || '-',
                isCredit ? 'CREDIT' : 'DEBIT',
                isCredit ? t.amount.toFixed(2) : '-',
                !isCredit ? Math.abs(t.amount).toFixed(2) : '-',
                '-',
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
    
    if (!confirm('Are you sure you want to update this user?')) return;
    
    try {
        await db.collection('users').doc(userId).update({
            email: email || null,
            balance: balance,
            status: status,
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
