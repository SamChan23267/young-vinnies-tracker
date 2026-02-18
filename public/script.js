// Utility Functions

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

// Index Page Functions
if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
    
    // Check authentication and user role
    async function checkAuthAndRole() {
        try {
            const response = await fetch('/api/check-auth');
            const data = await response.json();
            if (!data.authenticated) {
                window.location.href = '/login.html';
            } else {
                // Show admin section if super admin
                if (data.role === 'super_admin') {
                    document.getElementById('admin-section').style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            window.location.href = '/login.html';
        }
    }
    
    checkAuthAndRole();
    
    // Add logout button handler
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    
    // Load members
    async function loadMembers() {
        try {
            const members = await fetch('/api/members').then(res => res.json());
            const tbody = document.getElementById('members-tbody');
            
            if (members.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" class="empty-state"><p>No members yet. Add your first member above!</p></td></tr>';
                return;
            }
            
            tbody.innerHTML = members.map(member => `
                <tr>
                    <td>${member.name}</td>
                    <td><strong>${member.code}</strong></td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Error loading members:', error);
        }
    }

    // Add member form handler
    document.getElementById('add-member-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('member-name');
        const name = nameInput.value.trim();
        
        if (!name) return;
        
        try {
            const member = await apiCall('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            
            showMessage(`Member "${member.name}" added with code ${member.code}!`, 'success');
            nameInput.value = '';
            loadMembers();
        } catch (error) {
            console.error('Error adding member:', error);
        }
    });

    // Load sessions
    async function loadSessions() {
        try {
            const sessions = await fetch('/api/sessions').then(res => res.json());
            const container = document.getElementById('sessions-list');
            
            if (sessions.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>No sessions yet. Create your first session above!</p></div>';
                return;
            }
            
            // Sort sessions by date (most recent first)
            sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            container.innerHTML = sessions.map(session => {
                const attendeeCount = session.attendees.length;
                const attendeeText = attendeeCount === 1 ? '1 attendee' : `${attendeeCount} attendees`;
                
                return `
                    <div class="session-item">
                        <h4>${session.description}</h4>
                        <p><strong>Date:</strong> ${new Date(session.date).toLocaleDateString()}</p>
                        <p><strong>Attendance:</strong> ${attendeeText}</p>
                        ${session.attendees.length > 0 ? `
                            <div class="attendees">
                                <strong>Attendees:</strong> ${session.attendees.join(', ')}
                            </div>
                        ` : ''}
                        <a href="session.html?id=${session.id}" class="btn btn-info">View/Edit Attendance</a>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }

    // Create session form handler
    document.getElementById('create-session-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dateInput = document.getElementById('session-date');
        const descriptionInput = document.getElementById('session-description');
        
        const date = dateInput.value;
        const description = descriptionInput.value.trim();
        
        if (!date || !description) return;
        
        try {
            const session = await apiCall('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, description })
            });
            
            showMessage(`Session "${session.description}" created!`, 'success');
            dateInput.value = '';
            descriptionInput.value = '';
            loadSessions();
        } catch (error) {
            console.error('Error creating session:', error);
        }
    });

    // Export CSV button handler
    document.getElementById('export-csv-btn')?.addEventListener('click', () => {
        const format = document.getElementById('export-format').value;
        const dateFormat = document.getElementById('date-format').value;
        window.location.href = `/api/export/csv?format=${format}&dateFormat=${dateFormat}`;
        showMessage('Downloading CSV file...', 'success');
    });

    // Initialize index page
    loadMembers();
    loadSessions();
}

// Session Page Functions
if (window.location.pathname.endsWith('session.html')) {
    
    // Check authentication on page load
    checkAuth();
    
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('id');
    
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
            
            // Display session details
            document.getElementById('session-title').textContent = session.description;
            document.getElementById('session-info').textContent = 
                `Date: ${new Date(session.date).toLocaleDateString()} | ${session.attendees.length} attendee(s)`;
            
            // Display attendance checkboxes
            const attendanceList = document.getElementById('attendance-list');
            
            if (members.length === 0) {
                attendanceList.innerHTML = '<div class="empty-state"><p>No members available. Add members first!</p></div>';
                return;
            }
            
            attendanceList.innerHTML = members.map(member => `
                <div class="attendance-item">
                    <input 
                        type="checkbox" 
                        id="member-${member.code}" 
                        value="${member.code}"
                        ${session.attendees.includes(member.code) ? 'checked' : ''}
                    >
                    <label for="member-${member.code}">
                        ${member.name} (${member.code})
                    </label>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error loading session details:', error);
            showMessage('Failed to load session details', 'error');
        }
    }

    // Save attendance form handler
    document.getElementById('attendance-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const checkboxes = document.querySelectorAll('#attendance-list input[type="checkbox"]');
        const attendees = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        
        try {
            await apiCall(`/api/sessions/${sessionId}/attendance`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attendees })
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
