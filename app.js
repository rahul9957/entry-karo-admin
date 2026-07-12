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
                t.description || t.note || t.utr || '-',
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
