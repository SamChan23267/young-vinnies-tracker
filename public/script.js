// Utility Functions

// Helper function to display role (hides sam role)
function getDisplayRole(role) {
    if (role === 'sam') return 'Super Admin';
    if (role === 'super_admin') return 'Super Admin';
    return 'Admin';
}

// Check authentication on page load
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        if (!data.authenticated) {
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    }
}

// Logout function
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    } catch (error) {
        showMessage('Logout failed', 'error');
    }
}

// Display a message to the user
function showMessage(message, type = 'success') {
    const container = document.getElementById('message-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    container.appendChild(messageDiv);
    
    // Remove message after 3 seconds
    setTimeout(() => {
        messageDiv.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

// API call wrapper
async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const error = await response.json();
            // If unauthorized, redirect to login
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            throw new Error(error.error || 'Request failed');
        }
        return await response.json();
    } catch (error) {
        showMessage(error.message, 'error');
        throw error;
    }
}

// Old Index Page code - REMOVED, now handled by Dashboard section below
// The new index.html is a dashboard, not a form page

// Session Page Functions
if (window.location.pathname.endsWith('session.html')) {
    
    // Check authentication on page load
    checkAuth();
    
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('id');
    
    let currentSession = null;
    
    if (!sessionId) {
        showMessage('No session ID provided', 'error');
        setTimeout(() => window.location.href = 'index.html', 2000);
    }

    // Load session details and attendance
    async function loadSessionDetails() {
        try {
            const [session, members] = await Promise.all([
                fetch(`/api/sessions/${sessionId}`).then(res => res.json()),
                fetch('/api/members').then(res => res.json())
            ]);
            
            currentSession = session;
            const defaultHours = session.hours || 1;
            
            // Display session details
            document.getElementById('session-title').textContent = session.description;
            document.getElementById('session-info').textContent = 
                `Date: ${new Date(session.date).toLocaleDateString()} | ${session.attendees.length} attendee(s) | ${defaultHours} hour(s) default`;
            
            // Display attendance checkboxes with hour inputs
            const attendanceList = document.getElementById('attendance-list');
            
            if (members.length === 0) {
                attendanceList.innerHTML = '<div class="empty-state"><p>No members available. Add members first!</p></div>';
                return;
            }
            
            attendanceList.innerHTML = members.map(member => {
                const isAttending = session.attendees.includes(member.code);
                const individualHours = session.individualHours && session.individualHours[member.code] 
                    ? session.individualHours[member.code] 
                    : defaultHours;
                
                return `
                    <div class="attendance-item">
                        <input 
                            type="checkbox" 
                            id="member-${member.code}" 
                            value="${member.code}"
                            ${isAttending ? 'checked' : ''}
                            onchange="toggleHoursInput('${member.code}')"
                        >
                        <label for="member-${member.code}">
                            ${member.name} (${member.code})
                        </label>
                        <div class="hours-input" id="hours-input-${member.code}" style="display: ${isAttending ? 'inline-block' : 'none'}; margin-left: 15px;">
                            <label for="hours-${member.code}" style="font-size: 0.9em;">Hours:</label>
                            <input 
                                type="number" 
                                id="hours-${member.code}" 
                                min="1" 
                                max="24" 
                                step="1" 
                                value="${individualHours}"
                                style="width: 70px; padding: 3px; border: 1px solid #ddd; border-radius: 4px;"
                            >
                        </div>
                    </div>
                `;
            }).join('');
            
        } catch (error) {
            console.error('Error loading session details:', error);
            showMessage('Failed to load session details', 'error');
        }
    }
    
    // Toggle hours input visibility
    window.toggleHoursInput = function(memberCode) {
        const checkbox = document.getElementById(`member-${memberCode}`);
        const hoursInput = document.getElementById(`hours-input-${memberCode}`);
        if (hoursInput) {
            hoursInput.style.display = checkbox.checked ? 'inline-block' : 'none';
        }
    };

    // Save attendance form handler
    document.getElementById('attendance-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const checkboxes = document.querySelectorAll('#attendance-list input[type="checkbox"]');
        const attendees = [];
        const individualHours = {};
        
        checkboxes.forEach(cb => {
            if (cb.checked) {
                const memberCode = cb.value;
                attendees.push(memberCode);
                
                // Get individual hours for this member
                const hoursInput = document.getElementById(`hours-${memberCode}`);
                if (hoursInput) {
                    const hours = parseFloat(hoursInput.value) || (currentSession.hours || 1);
                    individualHours[memberCode] = hours;
                }
            }
        });
        
        try {
            await apiCall(`/api/sessions/${sessionId}/attendance`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attendees, individualHours })
            });
            
            showMessage('Attendance saved successfully!', 'success');
            setTimeout(() => loadSessionDetails(), 500);
        } catch (error) {
            console.error('Error saving attendance:', error);
        }
    });

    // Add logout button handler
    document.getElementById('logout-btn')?.addEventListener('click', logout);

    // Initialize session page
    loadSessionDetails();
}

// Audit Log Page Functions
if (window.location.pathname.endsWith('audit-log.html')) {
    
    // Check authentication and super admin role
    async function checkSuperAdmin() {
        try {
            const response = await fetch('/api/check-auth');
            const data = await response.json();
            if (!data.authenticated) {
                window.location.href = '/login.html';
            } else if (data.role !== 'super_admin') {
                showMessage('Access denied. Super admin only.', 'error');
                setTimeout(() => window.location.href = 'index.html', 2000);
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            window.location.href = '/login.html';
        }
    }
    
    checkSuperAdmin();
    
    // Add logout button handler
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    
    // Load audit log
    async function loadAuditLog() {
        try {
            const logs = await apiCall('/api/audit-log');
            const tbody = document.getElementById('audit-log-tbody');
            
            if (logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No audit log entries yet.</p></td></tr>';
                return;
            }
            
            // Sort logs by timestamp, most recent first
            logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            tbody.innerHTML = logs.map(log => {
                const date = new Date(log.timestamp);
                const formattedDate = date.toLocaleString();
                const details = JSON.stringify(log.data, null, 2);
                
                return `
                    <tr>
                        <td>${formattedDate}</td>
                        <td><strong>${log.username || 'unknown'}</strong></td>
                        <td><span class="action-badge">${log.action}</span></td>
                        <td><pre style="margin: 0; font-size: 0.85em; max-width: 400px; overflow-x: auto;">${details}</pre></td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading audit log:', error);
            showMessage('Failed to load audit log', 'error');
        }
    }
    
    // Initialize audit log page
    loadAuditLog();
}

// Common initialization for all pages (except login)
if (!window.location.pathname.endsWith('login.html')) {
    // Show audit link and admin management link in nav for super admins (including sam)
    async function initNav() {
        try {
            const response = await fetch('/api/check-auth');
            const data = await response.json();
            // Show admin features for both super_admin and sam roles
            if (data.role === 'super_admin' || data.role === 'sam') {
                const navAudit = document.getElementById('nav-audit');
                if (navAudit) {
                    navAudit.style.display = 'block';
                }
                const navAdmin = document.getElementById('nav-admin-management');
                if (navAdmin) {
                    navAdmin.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Nav init failed:', error);
        }
    }
    initNav();
}

// Dashboard Page (index.html)
if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
    // Load dashboard data
    async function loadDashboardData() {
        try {
            const [members, sessions] = await Promise.all([
                fetch('/api/members').then(res => res.json()),
                fetch('/api/sessions').then(res => res.json())
            ]);
            
            // Calculate statistics
            const totalMembers = members.length;
            const totalSessions = sessions.length;
            let totalHours = 0;
            let totalAttendances = 0;
            
            sessions.forEach(session => {
                const sessionHours = session.hours || 1;
                session.attendees.forEach(memberCode => {
                    totalAttendances++;
                    // Check if there's an individual hour override
                    const individualHours = session.individualHours && session.individualHours[memberCode] 
                        ? session.individualHours[memberCode] 
                        : sessionHours;
                    totalHours += individualHours;
                });
            });
            
            const avgAttendance = totalSessions > 0 ? Math.round(totalAttendances / totalSessions) : 0;
            
            // Update stat cards
            document.getElementById('total-members').textContent = totalMembers;
            document.getElementById('total-sessions').textContent = totalSessions;
            document.getElementById('total-attendances').textContent = `${totalHours} hrs`;
            document.getElementById('avg-attendance').textContent = avgAttendance;
            
            // Load recent sessions (last 5)
            const recentSessions = sessions.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
            const recentSessionsContainer = document.getElementById('recent-sessions-list');
            
            if (recentSessions.length === 0) {
                recentSessionsContainer.innerHTML = '<p class="empty-state">No sessions yet. <a href="sessions.html">Create your first session</a>!</p>';
            } else {
                recentSessionsContainer.innerHTML = recentSessions.map(session => {
                    const sessionHours = session.hours || 1;
                    return `
                        <div class="recent-session-item">
                            <h4>${session.description}</h4>
                            <p>Date: ${new Date(session.date).toLocaleDateString()}</p>
                            <p>Attendees: ${session.attendees.length} (${sessionHours} hrs)</p>
                        </div>
                    `;
                }).join('');
            }
            
            // Load top volunteers - now calculated by total hours
            const memberHours = {};
            members.forEach(member => {
                memberHours[member.code] = {
                    name: member.name,
                    code: member.code,
                    hours: 0
                };
            });
            
            sessions.forEach(session => {
                const sessionHours = session.hours || 1;
                session.attendees.forEach(code => {
                    if (memberHours[code]) {
                        const individualHours = session.individualHours && session.individualHours[code] 
                            ? session.individualHours[code] 
                            : sessionHours;
                        memberHours[code].hours += individualHours;
                    }
                });
            });
            
            const topVolunteers = Object.values(memberHours)
                .sort((a, b) => b.hours - a.hours)
                .slice(0, 5);
            
            const topVolunteersContainer = document.getElementById('top-volunteers-list');
            
            if (topVolunteers.length === 0 || topVolunteers[0].hours === 0) {
                topVolunteersContainer.innerHTML = '<p class="empty-state">No attendance data yet.</p>';
            } else {
                topVolunteersContainer.innerHTML = topVolunteers.map(volunteer => `
                    <div class="top-volunteer-item">
                        <h4>${volunteer.name} (${volunteer.code})</h4>
                        <p>Total hours: ${volunteer.hours}</p>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }
    
    loadDashboardData();
}

// Members Page
if (window.location.pathname.endsWith('members.html')) {
    let allMembers = [];
    let allSessions = [];
    
    // Load members
    async function loadMembersPage() {
        try {
            [allMembers, allSessions] = await Promise.all([
                fetch('/api/members').then(res => res.json()),
                fetch('/api/sessions').then(res => res.json())
            ]);
            
            displayMembers(allMembers);
        } catch (error) {
            console.error('Error loading members:', error);
        }
    }
    
    // Display members
    function displayMembers(members) {
        const tbody = document.getElementById('members-tbody');
        document.getElementById('member-count').textContent = members.length;
        
        if (members.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No members yet. Add your first member above!</p></td></tr>';
            return;
        }
        
        // Calculate total hours for each member
        const memberHours = {};
        allSessions.forEach(session => {
            const sessionHours = session.hours || 1;
            session.attendees.forEach(code => {
                const individualHours = session.individualHours && session.individualHours[code] 
                    ? session.individualHours[code] 
                    : sessionHours;
                memberHours[code] = (memberHours[code] || 0) + individualHours;
            });
        });
        
        tbody.innerHTML = members.map(member => `
            <tr>
                <td>${member.name}</td>
                <td><strong>${member.code}</strong></td>
                <td>${member.yearLevel || '-'}</td>
                <td>${memberHours[member.code] || 0} hrs</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-edit" onclick="editMember('${member.code}')">Edit</button>
                        <button class="btn btn-delete" onclick="deleteMember('${member.code}', '${member.name}')">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    
    // Search functionality
    document.getElementById('member-search')?.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredMembers = allMembers.filter(member =>
            member.name.toLowerCase().includes(searchTerm) ||
            member.code.toLowerCase().includes(searchTerm) ||
            (member.yearLevel && member.yearLevel.toLowerCase().includes(searchTerm))
        );
        displayMembers(filteredMembers);
    });
    
    // Add member form handler
    document.getElementById('add-member-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('member-name');
        const yearLevelInput = document.getElementById('member-year-level');
        const name = nameInput.value.trim();
        const yearLevel = yearLevelInput.value.trim();
        
        if (!name) return;
        
        try {
            const member = await apiCall('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, yearLevel })
            });
            
            showMessage(`Member "${member.name}" added with code ${member.code}!`, 'success');
            nameInput.value = '';
            yearLevelInput.value = '';
            loadMembersPage();
        } catch (error) {
            console.error('Error adding member:', error);
        }
    });
    
    // Edit member modal functions
    window.editMember = async function(code) {
        const member = allMembers.find(m => m.code === code);
        if (!member) return;
        
        document.getElementById('edit-member-old-code').value = code;
        document.getElementById('edit-member-name').value = member.name;
        document.getElementById('edit-member-code').value = member.code;
        document.getElementById('edit-member-year-level').value = member.yearLevel || '';
        
        document.getElementById('edit-member-modal').style.display = 'block';
    };
    
    // Delete member
    window.deleteMember = async function(code, name) {
        if (!confirm(`Are you sure you want to delete member "${name}"? This will also remove them from all session attendance records.`)) {
            return;
        }
        
        try {
            await apiCall(`/api/members/${code}`, {
                method: 'DELETE'
            });
            
            showMessage(`Member "${name}" deleted successfully!`, 'success');
            loadMembersPage();
        } catch (error) {
            console.error('Error deleting member:', error);
        }
    };
    
    // Edit member form submission
    document.getElementById('edit-member-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldCode = document.getElementById('edit-member-old-code').value;
        const name = document.getElementById('edit-member-name').value.trim();
        const newCode = document.getElementById('edit-member-code').value.trim();
        const yearLevel = document.getElementById('edit-member-year-level').value.trim();
        
        if (!name || !newCode) return;
        
        try {
            await apiCall(`/api/members/${oldCode}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, newCode, yearLevel })
            });
            
            showMessage(`Member updated successfully!`, 'success');
            document.getElementById('edit-member-modal').style.display = 'none';
            loadMembersPage();
        } catch (error) {
            console.error('Error updating member:', error);
        }
    });
    
    // Modal close handlers
    document.querySelector('#edit-member-modal .modal-close')?.addEventListener('click', () => {
        document.getElementById('edit-member-modal').style.display = 'none';
    });
    
    document.querySelector('#edit-member-modal .modal-cancel')?.addEventListener('click', () => {
        document.getElementById('edit-member-modal').style.display = 'none';
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('edit-member-modal');
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    loadMembersPage();
}

// Sessions Page
if (window.location.pathname.endsWith('sessions.html')) {
    let allSessions = [];
    
    // Load sessions
    async function loadSessionsPage() {
        try {
            allSessions = await fetch('/api/sessions').then(res => res.json());
            displaySessions(allSessions);
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }
    
    // Display sessions
    function displaySessions(sessions) {
        const container = document.getElementById('sessions-list');
        document.getElementById('session-count').textContent = sessions.length;
        
        if (sessions.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No sessions found.</p></div>';
            return;
        }
        
        // Sort sessions by date (most recent first)
        sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        container.innerHTML = sessions.map(session => {
            const attendeeCount = session.attendees.length;
            const attendeeText = attendeeCount === 1 ? '1 attendee' : `${attendeeCount} attendees`;
            const hours = session.hours || 1;
            const totalHours = attendeeCount * hours;
            
            return `
                <div class="session-item">
                    <div class="action-buttons">
                        <button class="btn btn-edit" onclick="editSession('${session.id}')">Edit</button>
                        <button class="btn btn-delete" onclick="deleteSession('${session.id}', '${session.description}')">Delete</button>
                    </div>
                    <h4>${session.description}</h4>
                    <p><strong>Date:</strong> ${new Date(session.date).toLocaleDateString()}</p>
                    <p><strong>Duration:</strong> ${hours} hour${hours !== 1 ? 's' : ''}</p>
                    <p><strong>Attendance:</strong> ${attendeeText} (${totalHours} total hours)</p>
                    ${session.attendees.length > 0 ? `
                        <div class="attendees">
                            <strong>Attendees:</strong> ${session.attendees.join(', ')}
                        </div>
                    ` : ''}
                    <a href="session.html?id=${session.id}" class="btn btn-info">View/Edit Attendance</a>
                </div>
            `;
        }).join('');
    }
    
    // Filter sessions with search and date range
    function filterSessions() {
        const searchTerm = document.getElementById('session-search').value.toLowerCase();
        const startDate = document.getElementById('session-start-date').value;
        const endDate = document.getElementById('session-end-date').value;
        
        let filtered = allSessions.filter(session =>
            session.description.toLowerCase().includes(searchTerm) ||
            session.date.includes(searchTerm)
        );
        
        if (startDate) {
            filtered = filtered.filter(s => new Date(s.date) >= new Date(startDate));
        }
        if (endDate) {
            filtered = filtered.filter(s => new Date(s.date) <= new Date(endDate));
        }
        
        displaySessions(filtered);
    }
    
    // Search functionality
    document.getElementById('session-search')?.addEventListener('input', filterSessions);
    document.getElementById('session-start-date')?.addEventListener('change', filterSessions);
    document.getElementById('session-end-date')?.addEventListener('change', filterSessions);
    
    // Clear date filter
    document.getElementById('clear-date-filter')?.addEventListener('click', () => {
        document.getElementById('session-start-date').value = '';
        document.getElementById('session-end-date').value = '';
        filterSessions();
    });
    
    // Create session form handler
    document.getElementById('create-session-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dateInput = document.getElementById('session-date');
        const descriptionInput = document.getElementById('session-description');
        const hoursInput = document.getElementById('session-hours');
        
        const date = dateInput.value;
        const description = descriptionInput.value.trim();
        const hours = parseFloat(hoursInput.value) || 1;
        
        if (!date || !description) return;
        
        try {
            const session = await apiCall('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, description, hours })
            });
            
            showMessage(`Session "${session.description}" created with ${session.hours} hour(s)!`, 'success');
            dateInput.value = '';
            descriptionInput.value = '';
            hoursInput.value = '1';
            loadSessionsPage();
        } catch (error) {
            console.error('Error creating session:', error);
        }
    });
    
    // Edit session modal functions
    window.editSession = async function(id) {
        const session = allSessions.find(s => s.id === id);
        if (!session) return;
        
        document.getElementById('edit-session-id').value = id;
        document.getElementById('edit-session-date').value = session.date;
        document.getElementById('edit-session-description').value = session.description;
        document.getElementById('edit-session-hours').value = session.hours || 1;
        
        document.getElementById('edit-session-modal').style.display = 'block';
    };
    
    // Delete session
    window.deleteSession = async function(id, description) {
        if (!confirm(`Are you sure you want to delete session "${description}"?`)) {
            return;
        }
        
        try {
            await apiCall(`/api/sessions/${id}`, {
                method: 'DELETE'
            });
            
            showMessage(`Session "${description}" deleted successfully!`, 'success');
            loadSessionsPage();
        } catch (error) {
            console.error('Error deleting session:', error);
        }
    };
    
    // Edit session form submission
    document.getElementById('edit-session-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-session-id').value;
        const date = document.getElementById('edit-session-date').value;
        const description = document.getElementById('edit-session-description').value.trim();
        const hours = parseFloat(document.getElementById('edit-session-hours').value) || 1;
        
        if (!date || !description) return;
        
        try {
            await apiCall(`/api/sessions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, description, hours })
            });
            
            showMessage(`Session updated successfully!`, 'success');
            document.getElementById('edit-session-modal').style.display = 'none';
            loadSessionsPage();
        } catch (error) {
            console.error('Error updating session:', error);
        }
    });
    
    // Modal close handlers
    document.querySelector('#edit-session-modal .modal-close')?.addEventListener('click', () => {
        document.getElementById('edit-session-modal').style.display = 'none';
    });
    
    document.querySelector('#edit-session-modal .modal-cancel')?.addEventListener('click', () => {
        document.getElementById('edit-session-modal').style.display = 'none';
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('edit-session-modal');
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    loadSessionsPage();
}

// Export Page
if (window.location.pathname.endsWith('export.html')) {
    let allSessions = [];
    let selectedSessions = new Set();
    
    // Load sessions for export
    async function loadExportSessions() {
        try {
            allSessions = await fetch('/api/sessions').then(res => res.json());
            displaySessionCheckboxes();
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }
    
    // Display session checkboxes
    function displaySessionCheckboxes() {
        const container = document.getElementById('session-selection-list');
        
        if (allSessions.length === 0) {
            container.innerHTML = '<p class="empty-state">No sessions available to export.</p>';
            return;
        }
        
        // Sort by date
        allSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        container.innerHTML = allSessions.map(session => `
            <div class="session-checkbox-item">
                <input type="checkbox" id="session-${session.id}" value="${session.id}" checked>
                <label for="session-${session.id}" class="session-checkbox-label">
                    <strong>${session.description}</strong>
                    <span>${new Date(session.date).toLocaleDateString()} - ${session.attendees.length} attendees</span>
                </label>
            </div>
        `).join('');
        
        // Initialize all as selected
        allSessions.forEach(session => selectedSessions.add(session.id));
        
        // Add change listeners
        container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedSessions.add(e.target.value);
                } else {
                    selectedSessions.delete(e.target.value);
                }
            });
        });
    }
    
    // Select all sessions
    document.getElementById('select-all-sessions')?.addEventListener('click', () => {
        document.querySelectorAll('#session-selection-list input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
            selectedSessions.add(cb.value);
        });
    });
    
    // Deselect all sessions
    document.getElementById('deselect-all-sessions')?.addEventListener('click', () => {
        document.querySelectorAll('#session-selection-list input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
            selectedSessions.delete(cb.value);
        });
    });
    
    // Export selected sessions
    document.getElementById('export-selected-btn')?.addEventListener('click', () => {
        const exportType = document.getElementById('export-type').value;
        
        if (exportType === 'googlesheet') {
            showMessage('Google Sheets export is coming soon!', 'info');
            return;
        }
        
        if (selectedSessions.size === 0) {
            showMessage('Please select at least one session to export', 'error');
            return;
        }
        
        const memberDisplay = document.getElementById('member-display').value;
        const orientation = document.getElementById('orientation').value;
        const sessionIds = Array.from(selectedSessions).join(',');
        
        window.location.href = `/api/export/csv?memberDisplay=${memberDisplay}&orientation=${orientation}&sessions=${sessionIds}`;
        showMessage('Downloading CSV file...', 'success');
    });
    
    // Export all sessions
    document.getElementById('export-all-btn')?.addEventListener('click', () => {
        const exportType = document.getElementById('export-type').value;
        
        if (exportType === 'googlesheet') {
            showMessage('Google Sheets export is coming soon!', 'info');
            return;
        }
        
        const memberDisplay = document.getElementById('member-display').value;
        const orientation = document.getElementById('orientation').value;
        const startDate = document.getElementById('date-range-start').value;
        const endDate = document.getElementById('date-range-end').value;
        
        let url = `/api/export/csv?memberDisplay=${memberDisplay}&orientation=${orientation}`;
        if (startDate) url += `&startDate=${startDate}`;
        if (endDate) url += `&endDate=${endDate}`;
        
        window.location.href = url;
        showMessage('Downloading CSV file...', 'success');
    });
    
    loadExportSessions();
}

// Settings Page
if (window.location.pathname.endsWith('settings.html')) {
    // Load user info
    async function loadUserInfo() {
        try {
            const response = await fetch('/api/check-auth');
            const data = await response.json();
            
            if (data.authenticated) {
                document.getElementById('user-username').textContent = data.username;
                document.getElementById('user-role').textContent = getDisplayRole(data.role);
                document.getElementById('user-display-name').textContent = data.displayName || data.username;
            }
        } catch (error) {
            console.error('Error loading user info:', error);
        }
    }
    
    // Change password form handler
    document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        
        if (newPassword !== confirmPassword) {
            showMessage('New passwords do not match', 'error');
            return;
        }
        
        if (newPassword.length < 6) {
            showMessage('New password must be at least 6 characters long', 'error');
            return;
        }
        
        try {
            await apiCall('/api/change-password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            
            showMessage('Password changed successfully!', 'success');
            document.getElementById('change-password-form').reset();
        } catch (error) {
            console.error('Error changing password:', error);
        }
    });
    
    loadUserInfo();
}
