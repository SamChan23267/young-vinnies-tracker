// Utility Functions

// Safe element value setter - prevents crash if element doesn't exist
function setVal(elId, val) { const el = document.getElementById(elId); if (el) el.value = val; }
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Custom field helpers for session forms
function addCustomField(containerId, key, value) {
    const container = document.getElementById(containerId);
    const row = document.createElement('div');
    row.className = 'custom-field-row';
    row.style.cssText = 'display: flex; gap: 8px; margin-bottom: 6px; align-items: center;';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'custom-field-key form-input';
    keyInput.placeholder = 'Field name';
    keyInput.value = key || '';
    keyInput.style.flex = '1';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'custom-field-value form-input';
    valueInput.placeholder = 'Value';
    valueInput.value = value || '';
    valueInput.style.flex = '1';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-delete';
    removeBtn.style.padding = '4px 10px';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => row.remove());

    row.appendChild(keyInput);
    row.appendChild(valueInput);
    row.appendChild(removeBtn);
    container.appendChild(row);
}

function addPresetField(containerId, presetKey) {
    const container = document.getElementById(containerId);
    const existing = container.querySelectorAll('.custom-field-key');
    for (const input of existing) {
        if (input.value === presetKey) {
            input.closest('.custom-field-row').querySelector('.custom-field-value').focus();
            return;
        }
    }
    addCustomField(containerId, presetKey, '');
}

function getCustomFields(containerId) {
    const container = document.getElementById(containerId);
    const fields = {};
    container.querySelectorAll('.custom-field-row').forEach(row => {
        const key = row.querySelector('.custom-field-key').value.trim();
        const value = row.querySelector('.custom-field-value').value.trim();
        if (key) {
            fields[key] = value;
        }
    });
    return fields;
}

function populateCustomFields(containerId, customFields) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (customFields && typeof customFields === 'object') {
        Object.entries(customFields).forEach(([key, value]) => {
            addCustomField(containerId, key, value);
        });
    }
}

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
    let currentMembers = [];
    let currentMemberTotalHours = {};
    let pendingAttendanceState = null; // Preserves unsaved checkbox state across re-renders
    
    if (!sessionId) {
        showMessage('No session ID provided', 'error');
        setTimeout(() => window.location.href = 'index.html', 2000);
    }

    // Load session details and attendance
    async function loadSessionDetails() {
        try {
            const [sessionRes, membersRes, allSessionsRes] = await Promise.all([
                fetch(`/api/sessions/${sessionId}`),
                fetch('/api/members'),
                fetch('/api/sessions')
            ]);

            if (!sessionRes.ok) {
                const errBody = await sessionRes.json().catch(parseErr => {
                    console.error('Error parsing session error response:', parseErr);
                    return {};
                });
                throw new Error(errBody.error || `Session request failed with status ${sessionRes.status}`);
            }

            const [session, members, allSessions] = await Promise.all([
                sessionRes.json(),
                membersRes.json(),
                allSessionsRes.json()
            ]);
            
            currentSession = session;
            const defaultHours = session.hours || 1;
            
            // Display session details
            const typeLabel = session.sessionType === 'project' ? 'Project' : session.sessionType === 'meeting' ? 'Meeting' : '';
            document.getElementById('session-title').textContent = session.description;
            document.getElementById('session-info').textContent = 
                `Date: ${new Date(session.date).toLocaleDateString()}${typeLabel ? ' | Type: ' + typeLabel : ''} | ${session.attendees.length} attendee(s) | ${defaultHours} hour(s) default`;
            
            // Display custom fields
            const cfDisplay = document.getElementById('session-custom-fields-display');
            if (cfDisplay) {
                const cf = session.customFields || {};
                // Also include legacy fields for backward compatibility
                if (session.whoWasHelped && !cf['Who Was Helped']) cf['Who Was Helped'] = session.whoWasHelped;
                if (session.itemsContributed && !cf['Items Contributed/Details']) cf['Items Contributed/Details'] = session.itemsContributed;
                if (session.notes && !cf['Notes']) cf['Notes'] = session.notes;
                
                const cfEntries = Object.entries(cf);
                if (cfEntries.length > 0) {
                    cfDisplay.innerHTML = '';
                    cfEntries.forEach(([key, value]) => {
                        const p = document.createElement('p');
                        const strong = document.createElement('strong');
                        strong.textContent = key + ':';
                        p.appendChild(strong);
                        p.appendChild(document.createTextNode(' ' + (value || 'Not set')));
                        cfDisplay.appendChild(p);
                    });
                } else {
                    cfDisplay.innerHTML = '';
                }
            }
            
            // Calculate total hours per member across all sessions
            const memberTotalHours = {};
            allSessions.forEach(s => {
                const sHours = s.hours || 1;
                s.attendees.forEach(code => {
                    const ih = (s.individualHours && s.individualHours[code]) ? s.individualHours[code] : sHours;
                    memberTotalHours[code] = (memberTotalHours[code] || 0) + ih;
                });
            });
            members.forEach(m => {
                memberTotalHours[m.code] = (memberTotalHours[m.code] || 0) + (m.manualHours || 0);
            });

            // Sort members by total hours descending
            members.sort((a, b) => (memberTotalHours[b.code] || 0) - (memberTotalHours[a.code] || 0));

            // Store for search filtering
            currentMembers = members;
            currentMemberTotalHours = memberTotalHours;

            renderAttendanceList(members, session, defaultHours, memberTotalHours);
            
        } catch (error) {
            console.error('Error loading session details:', error);
            showMessage('Failed to load session details', 'error');
        }
    }

    function renderAttendanceList(members, session, defaultHours, memberTotalHours) {
        // Display attendance checkboxes with hour inputs
        const attendanceList = document.getElementById('attendance-list');
        
        if (members.length === 0) {
            attendanceList.innerHTML = '<div class="empty-state"><p>No members available. Add members first!</p></div>';
            return;
        }
        
        attendanceList.innerHTML = members.map(member => {
            const savedAttending = session.attendees.includes(member.code);
            const isAttending = pendingAttendanceState
                ? (pendingAttendanceState[member.code]?.checked ?? savedAttending)
                : savedAttending;
            const individualHours = pendingAttendanceState && pendingAttendanceState[member.code]
                ? pendingAttendanceState[member.code].hours
                : (session.individualHours && session.individualHours[member.code] 
                    ? session.individualHours[member.code] 
                    : defaultHours);
            const totalHrs = memberTotalHours[member.code] || 0;
            
            return `
                <div class="attendance-item" data-name="${member.name.toLowerCase()}" data-code="${member.code.toLowerCase()}">
                    <input 
                        type="checkbox" 
                        id="member-${member.code}" 
                        value="${member.code}"
                        ${isAttending ? 'checked' : ''}
                        onchange="toggleHoursInput('${member.code}')"
                    >
                    <label for="member-${member.code}">
                        ${member.name} (${member.code}) <span style="color: #888; font-size: 0.85em;">[${totalHrs} hrs total]</span>
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
        pendingAttendanceState = null;
    }

    // Attendance search filter
    document.getElementById('attendance-search')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#attendance-list .attendance-item').forEach(item => {
            const name = item.getAttribute('data-name') || '';
            const code = item.getAttribute('data-code') || '';
            item.style.display = (name.includes(term) || code.includes(term)) ? '' : 'none';
        });
    });

    // Add member inline form toggle
    document.getElementById('add-member-attendance-btn')?.addEventListener('click', () => {
        const form = document.getElementById('add-member-inline');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
    document.getElementById('cancel-add-member-inline')?.addEventListener('click', () => {
        document.getElementById('add-member-inline').style.display = 'none';
    });
    document.getElementById('add-member-inline-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('inline-member-name');
        const yearInput = document.getElementById('inline-member-year');
        const name = nameInput.value.trim();
        const yearLevel = yearInput.value.trim();
        if (!name) return;
        try {
            const member = await apiCall('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, yearLevel })
            });
            showMessage(`Member "${member.name}" added with code ${member.code}!`, 'success');
            nameInput.value = '';
            yearInput.value = '';
            document.getElementById('add-member-inline').style.display = 'none';
            // Capture current unsaved attendance state before re-rendering
            pendingAttendanceState = {};
            document.querySelectorAll('#attendance-list input[type="checkbox"]').forEach(cb => {
                const code = cb.value;
                const hoursInput = document.getElementById(`hours-${code}`);
                pendingAttendanceState[code] = {
                    checked: cb.checked,
                    hours: hoursInput ? (parseFloat(hoursInput.value) || (currentSession?.hours || 1)) : (currentSession?.hours || 1)
                };
            });
            loadSessionDetails();
        } catch (error) {
            console.error('Error adding member:', error);
        }
    });
    
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
        
        const skipLog = getSkipLogValue('attendance-skip-log-checkbox');
        
        try {
            await apiCall(`/api/sessions/${sessionId}/attendance`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attendees, individualHours, skipLog })
            });
            
            showMessage('Attendance saved successfully!', 'success');
            setTimeout(() => loadSessionDetails(), 500);
        } catch (error) {
            console.error('Error saving attendance:', error);
        }
    });

    // Add logout button handler
    document.getElementById('logout-btn')?.addEventListener('click', logout);

    // Edit session button - open modal
    document.getElementById('edit-session-btn')?.addEventListener('click', () => {
        if (!currentSession) return;
        
        setVal('edit-session-id', currentSession.id);
        setVal('edit-session-date', currentSession.date);
        setVal('edit-session-description', currentSession.description);
        setVal('edit-session-hours', currentSession.hours || 1);
        setVal('edit-session-type', currentSession.sessionType || '');

        // Populate custom fields, with backward compatibility for legacy fields
        const cf = currentSession.customFields ? { ...currentSession.customFields } : {};
        if (currentSession.whoWasHelped && !cf['Who Was Helped']) cf['Who Was Helped'] = currentSession.whoWasHelped;
        if (currentSession.itemsContributed && !cf['Items Contributed/Details']) cf['Items Contributed/Details'] = currentSession.itemsContributed;
        if (currentSession.notes && !cf['Notes']) cf['Notes'] = currentSession.notes;
        populateCustomFields('edit-session-custom-fields', cf);
        
        const modal = document.getElementById('edit-session-modal');
        if (modal) modal.style.display = 'block';
    });

    // Edit session form submission
    document.getElementById('edit-session-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-session-id').value;
        const date = document.getElementById('edit-session-date').value;
        const description = document.getElementById('edit-session-description').value.trim();
        const hours = parseFloat(document.getElementById('edit-session-hours').value) || 1;
        const sessionType = document.getElementById('edit-session-type').value;
        const customFields = getCustomFields('edit-session-custom-fields');
        const skipLog = getSkipLogValue('edit-session-skip-log-checkbox');
        
        if (!date || !description) return;
        
        try {
            await apiCall(`/api/sessions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, description, hours, sessionType, customFields, skipLog })
            });
            
            showMessage('Session updated successfully!', 'success');
            document.getElementById('edit-session-modal').style.display = 'none';
            loadSessionDetails();
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

    // Initialize session page
    loadSessionDetails();
}

// Audit Log Page Functions
if (window.location.pathname.endsWith('audit-log.html')) {
    
    // Check authentication and super admin role, then load audit log.
    // isSamUser must be set BEFORE loadAuditLog() renders the hide/show buttons,
    // so we do both in a single async function to avoid a race condition.
    async function checkSuperAdmin() {
        try {
            const response = await fetch('/api/check-auth');
            const data = await response.json();
            if (!data.authenticated) {
                window.location.href = '/login.html';
            } else if (data.role !== 'super_admin' && data.role !== 'sam') {
                showMessage('Access denied. Super admin only.', 'error');
                setTimeout(() => window.location.href = 'index.html', 2000);
            } else {
                isSamUser = data.role === 'sam';
                loadAuditLog();
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
                tbody.innerHTML = `<tr><td colspan="${isSamUser ? '5' : '4'}" class="empty-state"><p>No audit log entries yet.</p></td></tr>`;
                return;
            }
            
            // Sort logs by timestamp, most recent first
            logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            tbody.innerHTML = logs.map((log, index) => {
                // Use _idx (original position in server cache) for hide operations so
                // that the server-side array lookup is correct after client-side sorting.
                // _idx is included by the server only for sam users (the only users who
                // can hide entries), so it is always defined when the button is rendered.
                const serverIdx = log._idx;
                const date = new Date(log.timestamp);
                const formattedDate = date.toLocaleString();
                const details = JSON.stringify(log.data, null, 2);
                const isHidden = log.hidden === true;
                const hiddenClass = isHidden ? ' hidden-log' : '';
                const hiddenIndicator = isHidden ? ' 👁️‍🗨️ Hidden' : '';
                
                return `
                    <tr class="audit-log-row${hiddenClass}" data-index="${serverIdx}">
                        <td>${formattedDate}</td>
                        <td><strong>${log.username || 'unknown'}</strong></td>
                        <td><span class="action-badge">${log.action}${hiddenIndicator}</span></td>
                        <td><pre style="margin: 0; font-size: 0.85em; max-width: 400px; overflow-x: auto;">${details}</pre></td>
                        ${isSamUser ? `<td>
                            <button class="btn ${isHidden ? 'btn-warning' : 'btn-secondary'}" onclick="toggleHideAuditLogEntry(${serverIdx})" title="${isHidden ? 'Unhide this log entry' : 'Hide this log entry'}">
                                ${isHidden ? '👁️ Show' : '🔒 Hide'}
                            </button>
                        </td>` : ''}
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading audit log:', error);
            showMessage('Failed to load audit log', 'error');
        }
    }

}

// Login Attempts Page Functions (sam only)
if (window.location.pathname.endsWith('login-attempts.html')) {
    async function checkSamAccess() {
        try {
            const response = await fetch('/api/check-auth');
            const data = await response.json();
            if (!data.authenticated) {
                window.location.href = '/login.html';
            } else if (data.role !== 'sam') {
                showMessage('Access denied. Sam only.', 'error');
                setTimeout(() => window.location.href = 'index.html', 2000);
            } else {
                isSamUser = true;
                loadLoginAttempts();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            window.location.href = '/login.html';
        }
    }

    async function loadLoginAttempts() {
        try {
            const attempts = await apiCall('/api/login-log');
            const tbody = document.getElementById('login-attempts-tbody');

            if (!tbody) return;
            if (attempts.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No login attempts recorded yet.</p></td></tr>';
                return;
            }

            attempts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            tbody.innerHTML = attempts.map((attempt) => {
                const timestamp = attempt.timestamp ? new Date(attempt.timestamp).toLocaleString() : 'unknown';
                const resultText = attempt.success ? '✅ Success' : '❌ Failed';
                const username = escapeHtml(attempt.username || 'unknown');
                const attemptedPasswordMasked = escapeHtml(attempt.attemptedPasswordMasked || '');
                const failureReason = escapeHtml(attempt.failureReason || '');
                const ipAddress = escapeHtml(attempt.ipAddress || 'unknown');
                const userAgent = escapeHtml(attempt.userAgent || 'unknown');

                return `
                    <tr>
                        <td>${timestamp}</td>
                        <td>${username}</td>
                        <td><code>${attemptedPasswordMasked}</code></td>
                        <td>${resultText}</td>
                        <td>${failureReason || '—'}</td>
                        <td>${ipAddress}</td>
                        <td style="max-width: 260px; word-break: break-word;">${userAgent}</td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading login attempts:', error);
            showMessage('Failed to load login attempts', 'error');
        }
    }

    checkSamAccess();
    document.getElementById('logout-btn')?.addEventListener('click', logout);
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
                const navLoginAttempts = document.getElementById('nav-login-attempts');
                if (navLoginAttempts && data.role === 'sam') {
                    navLoginAttempts.style.display = 'block';
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
    
    // Calculate total hours for a member
    function calculateMemberHours(memberCode) {
        let hours = 0;
        allSessions.forEach(session => {
            const sessionHours = session.hours || 1;
            if (session.attendees.includes(memberCode)) {
                const individualHours = session.individualHours && session.individualHours[memberCode] 
                    ? session.individualHours[memberCode] 
                    : sessionHours;
                hours += individualHours;
            }
        });
        const member = allMembers.find(m => m.code === memberCode);
        return hours + (member?.manualHours || 0);
    }
    
    // Populate year level filters dynamically
    function populateYearLevelFilters() {
        const yearLevelsSet = new Set();
        allMembers.forEach(member => {
            if (member.yearLevel) {
                yearLevelsSet.add(member.yearLevel);
            }
        });
        
        const yearLevels = Array.from(yearLevelsSet).sort((a, b) => {
            const aNum = parseInt(a);
            const bNum = parseInt(b);
            if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
            return a.toString().localeCompare(b.toString());
        });
        
        const container = document.getElementById('year-level-filters');
        if (!container) return;
        
        if (yearLevels.length === 0) {
            container.innerHTML = '<span style="color: #666; font-style: italic;">No year levels available</span>';
            return;
        }
        
        container.innerHTML = yearLevels.map(year => `
            <label class="checkbox-label" style="display: inline-flex; align-items: center; gap: 5px; cursor: pointer;">
                <input type="checkbox" class="year-level-checkbox" value="${year}" checked>
                <span>Year ${year}</span>
            </label>
        `).join('');
        
        // Add event listeners to checkboxes
        container.querySelectorAll('.year-level-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', filterAndSortMembers);
        });
    }
    
    // Filter and sort members based on all criteria
    function filterAndSortMembers() {
        let filteredMembers = [...allMembers];
        
        // Apply search filter
        const searchTerm = document.getElementById('member-search')?.value.toLowerCase() || '';
        if (searchTerm) {
            filteredMembers = filteredMembers.filter(member =>
                member.name.toLowerCase().includes(searchTerm) ||
                member.code.toLowerCase().includes(searchTerm) ||
                (member.yearLevel && member.yearLevel.toLowerCase().includes(searchTerm))
            );
        }
        
        // Apply year level filter
        const selectedYears = Array.from(document.querySelectorAll('.year-level-checkbox:checked'))
            .map(cb => cb.value);
        if (selectedYears.length > 0) {
            const allYearCheckboxes = document.querySelectorAll('.year-level-checkbox');
            // Only filter if not all checkboxes are checked (meaning user has deselected some)
            if (selectedYears.length < allYearCheckboxes.length) {
                filteredMembers = filteredMembers.filter(member =>
                    member.yearLevel && selectedYears.includes(member.yearLevel)
                );
            }
        }
        
        // Apply hours range filter
        const hoursMin = parseFloat(document.getElementById('hours-min')?.value);
        const hoursMax = parseFloat(document.getElementById('hours-max')?.value);
        if (!isNaN(hoursMin) || !isNaN(hoursMax)) {
            filteredMembers = filteredMembers.filter(member => {
                const totalHours = calculateMemberHours(member.code);
                if (!isNaN(hoursMin) && totalHours < hoursMin) return false;
                if (!isNaN(hoursMax) && totalHours > hoursMax) return false;
                return true;
            });
        }
        
        // Apply sorting - cache hours calculation for performance
        const sortValue = document.getElementById('member-sort')?.value || '';
        if (sortValue) {
            const hoursCache = new Map();
            if (sortValue === 'hours-asc' || sortValue === 'hours-desc') {
                filteredMembers.forEach(member => {
                    hoursCache.set(member.code, calculateMemberHours(member.code));
                });
            }
            
            filteredMembers.sort((a, b) => {
                switch(sortValue) {
                    case 'year-asc': {
                        const aYear = parseInt(a.yearLevel) || 999;
                        const bYear = parseInt(b.yearLevel) || 999;
                        return aYear - bYear;
                    }
                    case 'year-desc': {
                        const aYearDesc = parseInt(a.yearLevel) || -1;
                        const bYearDesc = parseInt(b.yearLevel) || -1;
                        return bYearDesc - aYearDesc;
                    }
                    case 'hours-asc':
                        return hoursCache.get(a.code) - hoursCache.get(b.code);
                    case 'hours-desc':
                        return hoursCache.get(b.code) - hoursCache.get(a.code);
                    default:
                        return 0;
                }
            });
        }
        
        displayMembers(filteredMembers);
    }
    
    // Clear all filters
    function clearMemberFilters() {
        const searchInput = document.getElementById('member-search');
        const sortSelect = document.getElementById('member-sort');
        const hoursMinInput = document.getElementById('hours-min');
        const hoursMaxInput = document.getElementById('hours-max');
        
        if (searchInput) searchInput.value = '';
        if (sortSelect) sortSelect.value = '';
        if (hoursMinInput) hoursMinInput.value = '';
        if (hoursMaxInput) hoursMaxInput.value = '';
        
        document.querySelectorAll('.year-level-checkbox').forEach(cb => cb.checked = true);
        filterAndSortMembers();
    }
    
    // Load members
    async function loadMembersPage() {
        try {
            [allMembers, allSessions] = await Promise.all([
                fetch('/api/members').then(res => res.json()),
                fetch('/api/sessions').then(res => res.json())
            ]);
            
            populateYearLevelFilters();
            filterAndSortMembers();
        } catch (error) {
            console.error('Error loading members:', error);
        }
    }
    // Expose to global scope so adjust-hours and year-level functions can trigger a reload
    window.loadMembersPage = loadMembersPage;
    
    // Display members
    function displayMembers(members) {
        const tbody = document.getElementById('members-tbody');
        document.getElementById('member-count').textContent = members.length;
        
        // Update total count display
        const totalCountSpan = document.getElementById('member-count-total');
        if (totalCountSpan) {
            if (members.length !== allMembers.length) {
                totalCountSpan.textContent = ` of ${allMembers.length}`;
            } else {
                totalCountSpan.textContent = '';
            }
        }
        
        if (members.length === 0) {
            if (allMembers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No members yet. Add your first member above!</p></td></tr>';
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No members match the current filters.</p></td></tr>';
            }
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
        
        tbody.innerHTML = members.map(member => {
            const totalHours = (memberHours[member.code] || 0) + (member.manualHours || 0);
            return `
            <tr>
                <td>${member.name}</td>
                <td><strong>${member.code}</strong></td>
                <td>${member.yearLevel || '-'}</td>
                <td>${member.email || '-'}</td>
                <td>${totalHours} hrs</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-edit" onclick="editMember('${member.code}')">Edit</button>
                        <button class="btn btn-delete" onclick="deleteMember('${member.code}', '${member.name}')">Delete</button>
                        ${isSuperAdminUser ? `<button class="btn btn-primary" style="background: #10b981;" onclick="showAdjustHoursModal('${member.code}', '${member.name}')">⏱️ Adjust Hours</button>` : ''}
                        ${isSuperAdminUser ? `<button class="btn ${member.hiddenFromPublic ? 'btn-warning' : 'btn-secondary'}" onclick="togglePublicVisibility('${member.code}')" title="${member.hiddenFromPublic ? 'Show on public page' : 'Hide from public page'}">${member.hiddenFromPublic ? '👁️ Show Public' : '🙈 Hide Public'}</button>` : ''}
                    </div>
                </td>
            </tr>
        `}).join('');
    }
    
    // Search functionality
    document.getElementById('member-search')?.addEventListener('input', filterAndSortMembers);
    
    // Filter and sort event listeners
    document.getElementById('member-sort')?.addEventListener('change', filterAndSortMembers);
    document.getElementById('hours-min')?.addEventListener('input', filterAndSortMembers);
    document.getElementById('hours-max')?.addEventListener('input', filterAndSortMembers);
    document.getElementById('clear-filters-btn')?.addEventListener('click', clearMemberFilters);
    
    // Add member form handler
    document.getElementById('add-member-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('member-name');
        const yearLevelInput = document.getElementById('member-year-level');
        const emailInput = document.getElementById('member-email');
        const name = nameInput.value.trim();
        const yearLevel = yearLevelInput.value.trim();
        const email = emailInput.value.trim();
        const skipLog = getSkipLogValue('add-member-skip-log-checkbox');
        
        if (!name) return;
        
        try {
            const member = await apiCall('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, yearLevel, email, skipLog })
            });
            
            showMessage(`Member "${member.name}" added with code ${member.code}!`, 'success');
            nameInput.value = '';
            yearLevelInput.value = '';
            emailInput.value = '';
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
        document.getElementById('edit-member-email').value = member.email || '';
        
        document.getElementById('edit-member-modal').style.display = 'block';
    };
    
    // Delete member
    window.deleteMember = async function(code, name) {
        if (!confirm(`Are you sure you want to delete member "${name}"? This will also remove them from all session attendance records.`)) {
            return;
        }
        
        const skipLog = isSamUser && confirm('Skip logging this deletion? (Sam privilege)\nClick OK to skip logging, Cancel to log normally.');
        
        try {
            await apiCall(`/api/members/${code}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skipLog })
            });
            
            showMessage(`Member "${name}" deleted successfully!`, 'success');
            loadMembersPage();
        } catch (error) {
            console.error('Error deleting member:', error);
        }
    };
    
    // Toggle member public visibility
    window.togglePublicVisibility = async function(code) {
        try {
            await apiCall(`/api/members/${code}/visibility`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' }
            });
            showMessage('Member visibility updated!', 'success');
            loadMembersPage();
        } catch (error) {
            console.error('Error toggling visibility:', error);
        }
    };
    
    // Edit member form submission
    document.getElementById('edit-member-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldCode = document.getElementById('edit-member-old-code').value;
        const name = document.getElementById('edit-member-name').value.trim();
        const newCode = document.getElementById('edit-member-code').value.trim();
        const yearLevel = document.getElementById('edit-member-year-level').value.trim();
        const email = document.getElementById('edit-member-email').value.trim();
        const skipLog = getSkipLogValue('edit-member-skip-log-checkbox');
        
        if (!name || !newCode) return;
        
        try {
            await apiCall(`/api/members/${oldCode}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, newCode, yearLevel, email, skipLog })
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
        const editModal = document.getElementById('edit-member-modal');
        const adjustModal = document.getElementById('adjust-hours-modal');
        if (e.target === editModal) {
            editModal.style.display = 'none';
        }
        if (e.target === adjustModal) {
            adjustModal.style.display = 'none';
        }
    });
    
    // Adjust Hours modal handlers
    document.querySelector('#adjust-hours-modal .modal-close')?.addEventListener('click', () => {
        document.getElementById('adjust-hours-modal').style.display = 'none';
    });
    
    document.querySelector('#adjust-hours-modal .modal-cancel')?.addEventListener('click', () => {
        document.getElementById('adjust-hours-modal').style.display = 'none';
    });
    
    document.getElementById('adjust-hours-form')?.addEventListener('submit', handleAdjustHours);
    
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
            const typeLabel = session.sessionType === 'project' ? 'Project' : session.sessionType === 'meeting' ? 'Meeting' : '';
            
            return `
                <div class="session-item">
                    <div class="action-buttons">
                        <button class="btn btn-edit" onclick="editSession('${session.id}')">Edit</button>
                        <button class="btn btn-delete" onclick="deleteSession('${session.id}', '${session.description}')">Delete</button>
                    </div>
                    <h4>${session.description}</h4>
                    <p><strong>Date:</strong> ${new Date(session.date).toLocaleDateString()}</p>
                    ${typeLabel ? `<p><strong>Type:</strong> ${typeLabel}</p>` : ''}
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
        const sessionTypeInput = document.getElementById('session-type');
        
        const date = dateInput.value;
        const description = descriptionInput.value.trim();
        const hours = parseFloat(hoursInput.value) || 1;
        const sessionType = sessionTypeInput.value;
        const customFields = getCustomFields('session-custom-fields');
        
        if (!date || !description) return;
        
        const skipLog = getSkipLogValue('create-session-skip-log-checkbox');
        
        try {
            const session = await apiCall('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, description, hours, sessionType, customFields, skipLog })
            });
            
            showMessage(`Session "${session.description}" created with ${session.hours} hour(s)!`, 'success');
            dateInput.value = '';
            descriptionInput.value = '';
            hoursInput.value = '1';
            sessionTypeInput.value = '';
            document.getElementById('session-custom-fields').innerHTML = '';
            loadSessionsPage();
        } catch (error) {
            console.error('Error creating session:', error);
        }
    });
    
    // Edit session modal functions
    window.editSession = async function(id) {
        const session = allSessions.find(s => s.id === id);
        if (!session) return;
        
        setVal('edit-session-id', id);
        setVal('edit-session-date', session.date);
        setVal('edit-session-description', session.description);
        setVal('edit-session-hours', session.hours || 1);
        setVal('edit-session-type', session.sessionType || '');

        // Populate custom fields, with backward compatibility for legacy fields
        const cf = session.customFields ? { ...session.customFields } : {};
        if (session.whoWasHelped && !cf['Who Was Helped']) cf['Who Was Helped'] = session.whoWasHelped;
        if (session.itemsContributed && !cf['Items Contributed/Details']) cf['Items Contributed/Details'] = session.itemsContributed;
        if (session.notes && !cf['Notes']) cf['Notes'] = session.notes;
        populateCustomFields('edit-session-custom-fields', cf);
        
        const modal = document.getElementById('edit-session-modal');
        if (modal) modal.style.display = 'block';
    };
    
    // Delete session
    window.deleteSession = async function(id, description) {
        if (!confirm(`Are you sure you want to delete session "${description}"?`)) {
            return;
        }
        
        const skipLog = isSamUser && confirm('Skip logging this deletion? (Sam privilege)\nClick OK to skip logging, Cancel to log normally.');
        
        try {
            await apiCall(`/api/sessions/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skipLog })
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
        const sessionType = document.getElementById('edit-session-type').value;
        const customFields = getCustomFields('edit-session-custom-fields');
        const skipLog = getSkipLogValue('edit-session-skip-log-checkbox');
        
        if (!date || !description) return;
        
        try {
            await apiCall(`/api/sessions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, description, hours, sessionType, customFields, skipLog })
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
            displayRRSessionCheckboxes();
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
    
    // Helper: generate clipboard text (tab-separated columnar format for Google Sheets paste)
    // Each session becomes a column: header row has session names, member names listed vertically below
    function generateClipboardData(sessions) {
        const memberDisplay = document.getElementById('member-display').value;

        const getMemberDisplay = (memberCode) => {
            const member = exportMembers.find(m => m.code === memberCode);
            if (!member) return memberCode;
            if (memberDisplay === 'code') return memberCode;
            if (memberDisplay === 'name') return member.name;
            if (memberDisplay === 'both') return `${memberCode} - ${member.name}`;
            return memberCode;
        };

        const formatDate = (dateStr) => {
            const d = new Date(dateStr);
            return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
        };

        // Build a column of member names for each session (repeated per hours worked)
        const columns = sessions.map(session => {
            const header = `${session.description} (${formatDate(session.date)})`;
            const members = [];
            session.attendees.forEach(code => {
                const hrs = (session.individualHours && session.individualHours[code])
                    ? session.individualHours[code] : (session.hours || 1);
                for (let i = 0; i < hrs; i++) members.push(getMemberDisplay(code));
            });
            return { header, members };
        });

        const maxRows = Math.max(0, ...columns.map(c => c.members.length));
        const rows = [];
        // Header row
        rows.push(columns.map(c => c.header).join('\t'));
        // Member rows
        for (let i = 0; i < maxRows; i++) {
            rows.push(columns.map(c => c.members[i] || '').join('\t'));
        }
        return rows.join('\n');
    }

    // Load members for clipboard generation
    let exportMembers = [];
    async function loadMembersForExport() {
        try {
            exportMembers = await fetch('/api/members').then(res => res.json());
        } catch (e) {
            console.error('Error loading members for export:', e);
        }
    }
    loadMembersForExport();

    // Copy selected sessions to clipboard
    document.getElementById('copy-selected-btn')?.addEventListener('click', async () => {
        if (selectedSessions.size === 0) {
            showMessage('Please select at least one session to copy', 'error');
            return;
        }
        const sessionIds = Array.from(selectedSessions);
        const sessions = allSessions.filter(s => sessionIds.includes(s.id));
        const text = generateClipboardData(sessions);
        try {
            await navigator.clipboard.writeText(text);
            showMessage('Copied to clipboard! Paste into Google Sheets.', 'success');
        } catch (e) {
            showMessage('Failed to copy to clipboard', 'error');
        }
    });

    // Copy all sessions to clipboard
    document.getElementById('copy-all-btn')?.addEventListener('click', async () => {
        let sessions = [...allSessions];
        const startDate = document.getElementById('date-range-start').value;
        const endDate = document.getElementById('date-range-end').value;
        if (startDate) sessions = sessions.filter(s => new Date(s.date) >= new Date(startDate));
        if (endDate) sessions = sessions.filter(s => new Date(s.date) <= new Date(endDate));
        const text = generateClipboardData(sessions);
        try {
            await navigator.clipboard.writeText(text);
            showMessage('Copied to clipboard! Paste into Google Sheets.', 'success');
        } catch (e) {
            showMessage('Failed to copy to clipboard', 'error');
        }
    });

    // Export Returns CSV
    document.getElementById('export-returns-btn')?.addEventListener('click', () => {
        const selectedRR = getSelectedRRSessions();
        if (selectedRR.length === 0) {
            showMessage('Please select at least one session to export', 'error');
            return;
        }

        let url = '/api/export/csv/returns';
        if (selectedRR.length < allSessions.length) {
            url += '?sessions=' + selectedRR.join(',');
        }

        window.location.href = url;
        showMessage('Downloading Returns CSV file...', 'success');
    });

    // Export Roll CSV
    document.getElementById('export-roll-btn')?.addEventListener('click', () => {
        const selectedRR = getSelectedRRSessions();
        if (selectedRR.length === 0) {
            showMessage('Please select at least one session to export', 'error');
            return;
        }

        let url = '/api/export/csv/roll';
        if (selectedRR.length < allSessions.length) {
            url += '?sessions=' + selectedRR.join(',');
        }

        window.location.href = url;
        showMessage('Downloading Roll CSV file...', 'success');
    });

    // Returns & Roll session list
    function displayRRSessionCheckboxes() {
        const container = document.getElementById('rr-session-list');
        if (!container) return;

        if (allSessions.length === 0) {
            container.innerHTML = '<p class="empty-state">No sessions available.</p>';
            return;
        }

        const sorted = [...allSessions].sort((a, b) => new Date(b.date) - new Date(a.date));
        container.innerHTML = sorted.map(session => {
            const typeLabel = session.sessionType === 'project' ? 'Project' : session.sessionType === 'meeting' ? 'Meeting' : '';
            return `
            <div class="session-checkbox-item">
                <input type="checkbox" id="rr-session-${session.id}" value="${session.id}" checked>
                <label for="rr-session-${session.id}" class="session-checkbox-label">
                    <strong>${session.description}</strong>
                    <span>${new Date(session.date).toLocaleDateString()}${typeLabel ? ' - ' + typeLabel : ''} - ${session.attendees.length} attendees</span>
                </label>
            </div>
        `}).join('');
    }

    function getSelectedRRSessions() {
        return Array.from(document.querySelectorAll('#rr-session-list input[type="checkbox"]:checked'))
            .map(cb => cb.value);
    }

    // Select / deselect all for Returns & Roll
    document.getElementById('rr-select-all')?.addEventListener('click', () => {
        document.querySelectorAll('#rr-session-list input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('rr-deselect-all')?.addEventListener('click', () => {
        document.querySelectorAll('#rr-session-list input[type="checkbox"]').forEach(cb => cb.checked = false);
    });

    // Date range filter for Returns & Roll
    document.getElementById('rr-apply-date-range')?.addEventListener('click', () => {
        const startDate = document.getElementById('rr-date-start').value;
        const endDate = document.getElementById('rr-date-end').value;
        if (!startDate && !endDate) {
            showMessage('Please set a start or end date', 'error');
            return;
        }
        const startD = startDate ? new Date(startDate) : null;
        const endD = endDate ? new Date(endDate) : null;
        document.querySelectorAll('#rr-session-list .session-checkbox-item').forEach(item => {
            const cb = item.querySelector('input[type="checkbox"]');
            const session = allSessions.find(s => String(s.id) === cb.value);
            if (session) {
                const d = new Date(session.date);
                const inRange = (!startD || d >= startD) && (!endD || d <= endD);
                cb.checked = inRange;
            }
        });
    });
    document.getElementById('rr-clear-date-range')?.addEventListener('click', () => {
        document.getElementById('rr-date-start').value = '';
        document.getElementById('rr-date-end').value = '';
        document.querySelectorAll('#rr-session-list input[type="checkbox"]').forEach(cb => cb.checked = true);
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
                // Show actual role for sam user in settings page, otherwise use display role
                document.getElementById('user-role').textContent = data.role === 'sam' ? 'sam' : getDisplayRole(data.role);
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
    
    // Logout button handler
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    
    loadUserInfo();
}

// ============================================
// SAM SPECIAL PERMISSIONS FUNCTIONS
// ============================================

// Global variable to track if current user is sam
let isSamUser = false;
// Global variable to track if current user is super admin (includes sam)
let isSuperAdminUser = false;

// Initialize Sam-specific UI elements
async function initSamFeatures() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        isSamUser = data.role === 'sam';
        isSuperAdminUser = data.role === 'sam' || data.role === 'super_admin';
        
        if (isSamUser) {
            // Show all "skip logging" checkboxes
            const skipLogElements = [
                'add-member-skip-log',
                'edit-member-skip-log',
                'create-session-skip-log',
                'edit-session-skip-log',
                'attendance-skip-log'
            ];
            skipLogElements.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.style.display = 'block';
            });
            
            // Show audit log actions column
            const auditHeader = document.getElementById('audit-log-actions-header');
            if (auditHeader) auditHeader.style.display = 'table-cell';
        }

        if (isSuperAdminUser) {
            // Show year level adjustment buttons
            const yearLevelAdjust = document.getElementById('year-level-adjust-section');
            if (yearLevelAdjust) yearLevelAdjust.style.display = 'block';
        }

        // Re-render members table if already loaded (fixes race condition with loadMembersPage)
        if (typeof window.loadMembersPage === 'function') {
            window.loadMembersPage();
        }
    } catch (error) {
        console.error('Error initializing Sam features:', error);
    }
}

// Manual Hours Adjustment Functions
function showAdjustHoursModal(memberCode, memberName) {
    const modal = document.getElementById('adjust-hours-modal');
    document.getElementById('adjust-hours-member-code').value = memberCode;
    document.getElementById('adjust-hours-member-name').value = memberName;
    document.getElementById('adjust-hours-amount').value = '';
    document.getElementById('adjust-hours-reason').value = '';
    document.getElementById('adjust-hours-skip-log-checkbox').checked = false;
    // Only show skip-log option for sam users
    const skipLogGroup = document.getElementById('adjust-hours-skip-log-group');
    if (skipLogGroup) skipLogGroup.style.display = isSamUser ? 'block' : 'none';
    modal.style.display = 'flex';
}

// Handle manual hours adjustment form submission
async function handleAdjustHours(event) {
    event.preventDefault();
    
    const memberCode = document.getElementById('adjust-hours-member-code').value;
    const hours = parseInt(document.getElementById('adjust-hours-amount').value);
    const reason = document.getElementById('adjust-hours-reason').value;
    const skipLog = document.getElementById('adjust-hours-skip-log-checkbox').checked;
    
    if (!hours || hours === 0) {
        showMessage('Please enter a non-zero hour adjustment', 'error');
        return;
    }
    
    try {
        await apiCall(`/api/members/${memberCode}/hours`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hours, reason, skipLog })
        });
        
        showMessage(`Hours adjusted successfully! ${hours > 0 ? 'Added' : 'Removed'} ${Math.abs(hours)} hour(s)`, 'success');
        document.getElementById('adjust-hours-modal').style.display = 'none';
        
        // Reload members if we're on the members page
        if (typeof window.loadMembersPage === 'function') {
            window.loadMembersPage();
        }
    } catch (error) {
        console.error('Error adjusting hours:', error);
    }
}

// Year Level Bulk Adjustment Functions
async function adjustAllYearLevels(delta) {
    const direction = delta > 0 ? 'increment' : 'decrement';
    const confirmed = confirm(`Are you sure you want to ${direction} ALL member year levels by 1?\n\nThis will affect every member with a numeric year level.`);
    if (!confirmed) return;
    
    try {
        const result = await apiCall('/api/members/year-levels/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delta })
        });
        
        showMessage(`Year levels ${direction}ed successfully! ${result.adjustedCount} member(s) updated.`, 'success');
        
        // Reload members if we're on the members page
        if (typeof window.loadMembersPage === 'function') {
            window.loadMembersPage();
        }
    } catch (error) {
        console.error('Error adjusting year levels:', error);
    }
}

// Delete Audit Log Entry
// Toggle hide/unhide audit log entry (sam only)
async function toggleHideAuditLogEntry(index) {
    try {
        const response = await apiCall(`/api/audit-log/${index}/hide`, {
            method: 'PUT'
        });
        
        showMessage(response.message, 'success');
        
        // Update the row immediately
        const row = document.querySelector(`tr.audit-log-row[data-index="${index}"]`);
        if (row) {
            const isHidden = response.hidden;
            
            // Update row class
            if (isHidden) {
                row.classList.add('hidden-log');
            } else {
                row.classList.remove('hidden-log');
            }
            
            // Update action badge
            const actionBadge = row.querySelector('.action-badge');
            if (actionBadge) {
                const actionText = actionBadge.textContent.replace(' 👁️‍🗨️ Hidden', '');
                actionBadge.textContent = actionText + (isHidden ? ' 👁️‍🗨️ Hidden' : '');
            }
            
            // Update hide/show button
            const hideBtn = row.querySelector('.btn-warning, .btn-secondary');
            if (hideBtn) {
                hideBtn.className = `btn ${isHidden ? 'btn-warning' : 'btn-secondary'}`;
                hideBtn.innerHTML = isHidden ? '👁️ Show' : '🔒 Hide';
                hideBtn.title = isHidden ? 'Unhide this log entry' : 'Hide this log entry';
            }
        }
    } catch (error) {
        console.error('Error toggling log visibility:', error);
        showMessage('Failed to toggle log visibility', 'error');
    }
}

// Helper function to check if current user is sam
async function checkIfSamUser() {
    try {
        const response = await apiCall('/api/check-auth');
        return response.role === 'sam';
    } catch (error) {
        return false;
    }
}

// Helper function to get skipLog value from checkbox
function getSkipLogValue(checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    return checkbox && checkbox.checked;
}

// Initialize Sam features on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSamFeatures);
} else {
    initSamFeatures();
}
