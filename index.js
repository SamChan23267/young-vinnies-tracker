// Load environment variables first
require('dotenv').config();

const express = require('express');
const cookieSession = require('cookie-session');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (required for rate limiting behind reverse proxies)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://vercel.live"],
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://vercel.live"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc.)
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://vercel.live", "wss://ws-us3.pusher.com", "wss://vercel.live"],
    },
  },
}));

// Compression middleware
app.use(compression());

// HTTP request logging
app.use(morgan(process.env.LOG_LEVEL || 'combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // limit each IP
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Middleware
app.use(express.json());

// Session configuration (cookie-based for serverless compatibility)
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'young-vinnies-secret-key-2024'],
  maxAge: parseInt(process.env.COOKIE_MAX_AGE, 10) || 24 * 60 * 60 * 1000, // 24 hours
  secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax'
}));

// Static files - but check auth for main pages
app.use((req, res, next) => {
  // Allow access to login page, static assets, and API endpoints
  if (req.path.includes('/login.html') || 
      req.path.includes('.css') || 
      req.path.includes('.js') ||
      req.path.startsWith('/api/')) {
    return next();
  }
  
  // For main pages, check authentication
  const protectedPages = ['/', '/index.html', '/session.html', '/audit-log.html', '/members.html', '/sessions.html', '/export.html', '/settings.html', '/admin-management.html'];
  if (protectedPages.includes(req.path)) {
    if (!req.session.authenticated) {
      return res.redirect('/login.html');
    }
  }
  
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// File paths
const DATA_FILE = path.join(__dirname, 'data.json');
const AUDIT_LOG_FILE = path.join(__dirname, 'audit_log.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// Writable file paths: Vercel serverless has a read-only project directory;
// /tmp is writable (though ephemeral). In production writes go to /tmp and
// reads try /tmp first, falling back to the bundled seed files.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const WRITE_DATA_FILE = IS_PRODUCTION ? '/tmp/data.json' : DATA_FILE;
const WRITE_AUDIT_LOG_FILE = IS_PRODUCTION ? '/tmp/audit_log.json' : AUDIT_LOG_FILE;
const WRITE_USERS_FILE = IS_PRODUCTION ? '/tmp/users.json' : USERS_FILE;

// Helper function to check if role is sam (secret role)
function isSamRole(role) {
  return role === 'sam';
}

// Helper function to get display role (hides sam role)
function getDisplayRole(role) {
  return role === 'sam' ? 'super_admin' : role;
}

// Helper function to read users
async function readUsers() {
  try {
    if (IS_PRODUCTION) {
      try {
        const data = await fs.readFile(WRITE_USERS_FILE, 'utf8');
        return JSON.parse(data);
      } catch {
        // Fall back to bundled seed file on cold start
      }
    }
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading users:', error);
    return [];
  }
}

// Authentication middleware for API routes
function requireAuth(req, res, next) {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: 'Unauthorized. Please login first.' });
  }
  next();
}

// Super admin middleware (includes sam role)
function requireSuperAdmin(req, res, next) {
  if (!req.session.authenticated || (req.session.role !== 'super_admin' && req.session.role !== 'sam')) {
    return res.status(403).json({ error: 'Forbidden. Super admin access required.' });
  }
  next();
}

// Helper function to read data
async function readData() {
  try {
    if (IS_PRODUCTION) {
      try {
        const data = await fs.readFile(WRITE_DATA_FILE, 'utf8');
        return JSON.parse(data);
      } catch {
        // Fall back to bundled seed file on cold start
      }
    }
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data:', error);
    return { members: [], sessions: [] };
  }
}

// Helper function to write data
async function writeData(data) {
  await fs.writeFile(WRITE_DATA_FILE, JSON.stringify(data, null, 2));
}

// Helper function to read audit log
async function readAuditLog() {
  try {
    if (IS_PRODUCTION) {
      try {
        const data = await fs.readFile(WRITE_AUDIT_LOG_FILE, 'utf8');
        return JSON.parse(data);
      } catch {
        // Fall back to bundled seed file on cold start
      }
    }
    const data = await fs.readFile(AUDIT_LOG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading audit log:', error);
    return [];
  }
}

// Helper function to log audit entry
async function logAudit(action, data, username, skipLog = false) {
  // If skipLog is true, don't log the action (sam's privilege)
  if (skipLog) {
    return;
  }
  
  try {
    const logs = await readAuditLog();
    logs.push({
      timestamp: new Date().toISOString(),
      username: username || 'unknown',
      action,
      data
    });
    await fs.writeFile(WRITE_AUDIT_LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Error logging audit:', error);
  }
}

// Helper function to generate unique member code
function generateMemberCode(name, existingCodes) {
  // Remove special characters and convert to uppercase
  const cleanName = name.replace(/[^a-zA-Z\s]/g, '').toUpperCase();
  const words = cleanName.split(/\s+/).filter(w => w.length > 0);
  
  let code = '';
  
  if (words.length === 1) {
    // Single name: take first 6 letters
    code = words[0].substring(0, 6);
  } else if (words.length >= 2) {
    // Multiple names: First name + first letter of last name
    const firstName = words[0];
    const lastInitial = words[words.length - 1].charAt(0);
    code = (firstName.substring(0, 5) + lastInitial).substring(0, 6);
  }
  
  // Ensure uniqueness by adding numbers if needed
  let finalCode = code;
  let counter = 1;
  while (existingCodes.includes(finalCode)) {
    finalCode = code + counter;
    counter++;
  }
  
  return finalCode;
}

// Generate unique session ID
function generateSessionId(existingSessions) {
  let maxId = 0;
  existingSessions.forEach(session => {
    const id = parseInt(session.id);
    if (id > maxId) maxId = id;
  });
  return (maxId + 1).toString();
}

// API Endpoints

// Authentication Endpoints

// POST /api/login - Authenticate user
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  try {
    const users = await readUsers();
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
      req.session.authenticated = true;
      req.session.username = username;
      req.session.role = user.role;
      req.session.displayName = user.displayName;
      res.json({ 
        success: true, 
        message: 'Login successful',
        role: user.role,
        displayName: user.displayName
      });
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/logout - Logout user
app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ success: true, message: 'Logout successful' });
});

// GET /api/check-auth - Check if user is authenticated
app.get('/api/check-auth', (req, res) => {
  res.json({ 
    authenticated: !!req.session.authenticated,
    username: req.session.username,
    role: req.session.role,
    displayName: req.session.displayName
  });
});

// Data Management Endpoints (Protected)

// GET /api/members - Return all members
app.get('/api/members', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    res.json(data.members);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// POST /api/members - Add a new member
app.post('/api/members', requireAuth, async (req, res) => {
  try {
    const { name, yearLevel, skipLog } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const data = await readData();
    const existingCodes = data.members.map(m => m.code);
    const code = generateMemberCode(name.trim(), existingCodes);
    
    const newMember = {
      name: name.trim(),
      code,
      yearLevel: yearLevel || '',
      manualHours: 0  // Initialize manual hours
    };
    
    data.members.push(newMember);
    await writeData(data);
    await logAudit('ADD_MEMBER', newMember, req.session.username, skipLog);
    
    res.status(201).json(newMember);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// PUT /api/members/:code - Update a member
app.put('/api/members/:code', requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const { name, newCode, yearLevel, skipLog } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const data = await readData();
    const memberIndex = data.members.findIndex(m => m.code === code);
    
    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    // Check if new code conflicts with existing codes (excluding current member)
    if (newCode && newCode !== code) {
      const codeExists = data.members.some((m, idx) => idx !== memberIndex && m.code === newCode);
      if (codeExists) {
        return res.status(400).json({ error: 'Code already exists' });
      }
    }
    
    const oldMember = { ...data.members[memberIndex] };
    const updatedCode = newCode || code;
    
    // Preserve manualHours if it exists
    const manualHours = data.members[memberIndex].manualHours || 0;
    
    // Update member
    data.members[memberIndex] = {
      name: name.trim(),
      code: updatedCode,
      yearLevel: yearLevel || '',
      manualHours: manualHours
    };
    
    // If code changed, update attendee lists in sessions
    if (updatedCode !== code) {
      data.sessions.forEach(session => {
        const attendeeIndex = session.attendees.indexOf(code);
        if (attendeeIndex !== -1) {
          session.attendees[attendeeIndex] = updatedCode;
        }
      });
    }
    
    await writeData(data);
    await logAudit('UPDATE_MEMBER', { old: oldMember, new: data.members[memberIndex] }, req.session.username, skipLog);
    
    res.json(data.members[memberIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// DELETE /api/members/:code - Delete a member
app.delete('/api/members/:code', requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const { skipLog } = req.body;
    const data = await readData();
    const memberIndex = data.members.findIndex(m => m.code === code);
    
    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const deletedMember = data.members[memberIndex];
    
    // Remove member from all session attendee lists
    data.sessions.forEach(session => {
      session.attendees = session.attendees.filter(attendeeCode => attendeeCode !== code);
    });
    
    // Remove member
    data.members.splice(memberIndex, 1);
    
    await writeData(data);
    await logAudit('DELETE_MEMBER', deletedMember, req.session.username, skipLog);
    
    res.json({ success: true, message: 'Member deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

// POST /api/members/:code/hours - Manually adjust member hours (sam only)
app.post('/api/members/:code/hours', requireAuth, async (req, res) => {
  try {
    // Only sam role can manually adjust hours
    if (req.session.role !== 'sam') {
      return res.status(403).json({ error: 'Only sam can manually adjust hours' });
    }
    
    const { code } = req.params;
    const { hours, reason, skipLog } = req.body;
    
    if (hours === undefined || hours === null) {
      return res.status(400).json({ error: 'Hours value is required' });
    }
    
    const data = await readData();
    const memberIndex = data.members.findIndex(m => m.code === code);
    
    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    // Initialize manualHours if it doesn't exist
    if (!data.members[memberIndex].manualHours) {
      data.members[memberIndex].manualHours = 0;
    }
    
    // Add hours (can be positive or negative)
    const hoursAdjusted = parseFloat(hours);
    data.members[memberIndex].manualHours += hoursAdjusted;
    
    await writeData(data);
    await logAudit('ADJUST_HOURS', {
      member: data.members[memberIndex].name,
      code: code,
      hoursAdjusted: hoursAdjusted,
      newManualTotal: data.members[memberIndex].manualHours,
      reason: reason || 'No reason provided'
    }, req.session.username, skipLog);
    
    res.json({
      success: true,
      member: data.members[memberIndex]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to adjust hours' });
  }
});

// GET /api/sessions - Return all sessions
app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    res.json(data.sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// POST /api/sessions - Create a new session
app.post('/api/sessions', requireAuth, async (req, res) => {
  try {
    const { date, description, hours, skipLog } = req.body;
    
    if (!date || !description) {
      return res.status(400).json({ error: 'Date and description are required' });
    }
    
    const data = await readData();
    const id = generateSessionId(data.sessions);
    
    const newSession = {
      id,
      date,
      description,
      hours: hours || 1, // Default to 1 hour if not specified
      attendees: [], // Will store member codes
      individualHours: {} // Object to store individual hour overrides: { memberCode: hours }
    };
    
    data.sessions.push(newSession);
    await writeData(data);
    await logAudit('CREATE_SESSION', newSession, req.session.username, skipLog);
    
    res.status(201).json(newSession);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/sessions/:id - Get a specific session with attendance details
app.get('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readData();
    const session = data.sessions.find(s => s.id === id);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// PUT /api/sessions/:id/attendance - Update attendance for a session
app.put('/api/sessions/:id/attendance', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { attendees, individualHours, skipLog } = req.body;
    
    if (!Array.isArray(attendees)) {
      return res.status(400).json({ error: 'Attendees must be an array' });
    }
    
    const data = await readData();
    const sessionIndex = data.sessions.findIndex(s => s.id === id);
    
    if (sessionIndex === -1) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    data.sessions[sessionIndex].attendees = attendees;
    
    // Update individual hours if provided
    if (individualHours && typeof individualHours === 'object') {
      if (!data.sessions[sessionIndex].individualHours) {
        data.sessions[sessionIndex].individualHours = {};
      }
      data.sessions[sessionIndex].individualHours = individualHours;
    }
    
    await writeData(data);
    await logAudit('UPDATE_ATTENDANCE', {
      sessionId: id,
      attendees,
      individualHours
    }, req.session.username, skipLog);
    
    res.json(data.sessions[sessionIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// PUT /api/sessions/:id - Update a session (date, description, hours)
app.put('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, description, hours, skipLog } = req.body;
    
    if (!date || !description) {
      return res.status(400).json({ error: 'Date and description are required' });
    }
    
    const data = await readData();
    const sessionIndex = data.sessions.findIndex(s => s.id === id);
    
    if (sessionIndex === -1) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const oldSession = { ...data.sessions[sessionIndex] };
    data.sessions[sessionIndex].date = date;
    data.sessions[sessionIndex].description = description;
    if (hours !== undefined) {
      data.sessions[sessionIndex].hours = hours;
    }
    
    await writeData(data);
    await logAudit('UPDATE_SESSION', {
      old: oldSession,
      new: data.sessions[sessionIndex]
    }, req.session.username, skipLog);
    
    res.json(data.sessions[sessionIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// DELETE /api/sessions/:id - Delete a session
app.delete('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { skipLog } = req.body;
    const data = await readData();
    const sessionIndex = data.sessions.findIndex(s => s.id === id);
    
    if (sessionIndex === -1) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const deletedSession = data.sessions[sessionIndex];
    data.sessions.splice(sessionIndex, 1);
    
    await writeData(data);
    await logAudit('DELETE_SESSION', deletedSession, req.session.username, skipLog);
    
    res.json({ success: true, message: 'Session deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// GET /api/export/csv - Generate and return a CSV file of all session attendance data
app.get('/api/export/csv', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    const memberDisplay = req.query.memberDisplay || 'code'; // code, name, both
    const orientation = req.query.orientation || 'horizontal'; // horizontal, vertical
    const sessionsParam = req.query.sessions; // comma-separated session IDs
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    
    // Filter sessions based on parameters
    let filteredSessions = data.sessions;
    
    // Filter by specific session IDs if provided
    if (sessionsParam) {
      const sessionIds = sessionsParam.split(',');
      filteredSessions = filteredSessions.filter(s => sessionIds.includes(s.id));
    }
    
    // Filter by date range if provided
    if (startDate) {
      filteredSessions = filteredSessions.filter(s => new Date(s.date) >= new Date(startDate));
    }
    if (endDate) {
      filteredSessions = filteredSessions.filter(s => new Date(s.date) <= new Date(endDate));
    }
    
    // Helper function to get member display value
    const getMemberDisplay = (memberCode) => {
      const member = data.members.find(m => m.code === memberCode);
      if (!member) return memberCode;
      
      if (memberDisplay === 'code') {
        return memberCode;
      } else if (memberDisplay === 'name') {
        return member.name;
      } else if (memberDisplay === 'both') {
        return `${memberCode} - ${member.name}`;
      }
      return memberCode;
    };
    
    let csv = '';
    
    if (orientation === 'horizontal') {
      // Horizontal format: One row per session with all attendees
      // Each member repeated for the number of hours they worked
      // Format: "Event (Date)", "MEMBER1", "MEMBER1", "MEMBER2", ...
      
      filteredSessions.forEach(session => {
        const eventName = `${session.description} (${session.date})`;
        const row = [`"${eventName}"`];
        
        session.attendees.forEach(attendeeCode => {
          const memberHours = (session.individualHours && session.individualHours[attendeeCode]) 
            ? session.individualHours[attendeeCode] 
            : (session.hours || 1);
          
          // Repeat the member name for the number of hours
          for (let i = 0; i < memberHours; i++) {
            row.push(`"${getMemberDisplay(attendeeCode)}"`);
          }
        });
        
        csv += row.join(',') + '\n';
      });
    } else if (orientation === 'vertical') {
      // Vertical format: One row per member per session
      // Each member repeated for the number of hours they worked
      // Format: "Event (Date)", "MEMBER1"
      //         "Event (Date)", "MEMBER1"
      //         "Event (Date)", "MEMBER2"
      
      filteredSessions.forEach(session => {
        const eventName = `${session.description} (${session.date})`;
        
        session.attendees.forEach(attendeeCode => {
          const memberHours = (session.individualHours && session.individualHours[attendeeCode]) 
            ? session.individualHours[attendeeCode] 
            : (session.hours || 1);
          
          // Create one row per hour for each member
          for (let i = 0; i < memberHours; i++) {
            csv += `"${eventName}","${getMemberDisplay(attendeeCode)}"\n`;
          }
        });
      });
    }
    
    const filename = 'volunteer_hours.csv';
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// GET /api/audit-log - Get audit log (super admin only)
app.get('/api/audit-log', requireSuperAdmin, async (req, res) => {
  try {
    let logs = await readAuditLog();
    
    // Filter out sam-only actions for non-sam users
    if (req.session.role !== 'sam') {
      logs = logs.filter(log => 
        log.action !== 'MANUAL_HOURS' && 
        log.action !== 'DELETE_LOG' &&
        log.action !== 'ADJUST_HOURS' &&
        !log.hidden  // Also filter out hidden logs
      );
    }
    
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// DELETE /api/audit-log/:index - Delete audit log entry (sam only)
app.delete('/api/audit-log/:index', requireAuth, async (req, res) => {
  try {
    // Only sam role can delete logs
    if (req.session.role !== 'sam') {
      return res.status(403).json({ error: 'Only sam can delete audit logs' });
    }
    
    const index = parseInt(req.params.index);
    const logs = await readAuditLog();
    
    if (index < 0 || index >= logs.length) {
      return res.status(400).json({ error: 'Invalid log index' });
    }
    
    // Remove the log entry
    logs.splice(index, 1);
    await fs.writeFile(WRITE_AUDIT_LOG_FILE, JSON.stringify(logs, null, 2));
    
    res.json({ message: 'Log entry deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete log entry' });
  }
});

// PUT /api/audit-log/:index/hide - Toggle hide/unhide audit log entry (sam only)
app.put('/api/audit-log/:index/hide', requireAuth, async (req, res) => {
  try {
    // Only sam role can hide/unhide logs
    if (req.session.role !== 'sam') {
      return res.status(403).json({ error: 'Only sam can hide/unhide audit logs' });
    }
    
    const index = parseInt(req.params.index);
    const logs = await readAuditLog();
    
    if (index < 0 || index >= logs.length) {
      return res.status(400).json({ error: 'Invalid log index' });
    }
    
    // Toggle the hidden status
    logs[index].hidden = !logs[index].hidden;
    await fs.writeFile(WRITE_AUDIT_LOG_FILE, JSON.stringify(logs, null, 2));
    
    res.json({ 
      message: logs[index].hidden ? 'Log entry hidden' : 'Log entry unhidden',
      hidden: logs[index].hidden 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle log visibility' });
  }
});

// PUT /api/change-password - Change user password
app.put('/api/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    
    const users = await readUsers();
    const userIndex = users.findIndex(u => u.username === req.session.username);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    if (users[userIndex].password !== currentPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Update password
    users[userIndex].password = newPassword;
    await fs.writeFile(WRITE_USERS_FILE, JSON.stringify(users, null, 2));
    
    await logAudit('CHANGE_PASSWORD', { username: req.session.username }, req.session.username);
    
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ===== USER MANAGEMENT ENDPOINTS (SUPER ADMIN ONLY) =====

// GET /api/users - Get all users (super admin only)
app.get('/api/users', requireSuperAdmin, async (req, res) => {
  try {
    const users = await readUsers();
    // Return users without passwords for security
    // Disguise sam role as super_admin
    const safeUsers = users.map(u => ({
      username: u.username,
      role: getDisplayRole(u.role),
      displayName: u.displayName
    }));
    res.json(safeUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users - Add new user (super admin only)
app.post('/api/users', requireSuperAdmin, async (req, res) => {
  try {
    const { username, password, role, displayName } = req.body;
    
    // Validation
    if (!username || !password || !role || !displayName) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Prevent creation of sam role users
    if (!['admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin or super_admin' });
    }
    
    const users = await readUsers();
    
    // Check if username already exists
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Add new user
    const newUser = { username, password, role, displayName };
    users.push(newUser);
    await fs.writeFile(WRITE_USERS_FILE, JSON.stringify(users, null, 2));
    
    await logAudit('ADD_USER', { username, role, displayName }, req.session.username);
    
    res.json({ success: true, message: 'User added successfully', user: { username, role, displayName } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add user' });
  }
});

// PUT /api/users/:username - Update user (super admin only)
app.put('/api/users/:username', requireSuperAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { password, role, displayName } = req.body;
    
    const users = await readUsers();
    const userIndex = users.findIndex(u => u.username === username);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Protect sam user from being edited by non-sam users
    if (isSamRole(users[userIndex].role) && req.session.role !== 'sam') {
      return res.status(403).json({ error: 'Cannot modify this user' });
    }
    
    // Prevent changing to sam role
    if (role === 'sam') {
      return res.status(403).json({ error: 'Invalid role' });
    }
    
    // Validate role if provided
    if (role && !['admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin or super_admin' });
    }
    
    // Validate password length if provided
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Prevent removing the last super admin (count sam as super admin for this check)
    if (role === 'admin' && users[userIndex].role === 'super_admin') {
      const superAdminCount = users.filter(u => u.role === 'super_admin' || u.role === 'sam').length;
      if (superAdminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last super admin' });
      }
    }
    
    // Update user fields
    if (password) users[userIndex].password = password;
    if (role) users[userIndex].role = role;
    if (displayName) users[userIndex].displayName = displayName;
    
    await fs.writeFile(WRITE_USERS_FILE, JSON.stringify(users, null, 2));
    
    await logAudit('UPDATE_USER', { username, updates: { password: password ? '***' : undefined, role, displayName } }, req.session.username);
    
    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:username - Delete user (super admin only)
app.delete('/api/users/:username', requireSuperAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    
    const users = await readUsers();
    const userIndex = users.findIndex(u => u.username === username);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Protect sam user from deletion
    if (isSamRole(users[userIndex].role)) {
      return res.status(403).json({ error: 'Cannot delete this user' });
    }
    
    // Prevent deleting yourself
    if (username === req.session.username) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // Prevent deleting the last super admin (count sam as super admin)
    if (users[userIndex].role === 'super_admin') {
      const superAdminCount = users.filter(u => u.role === 'super_admin' || u.role === 'sam').length;
      if (superAdminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last super admin' });
      }
    }
    
    const deletedRole = users[userIndex].role;
    
    // Remove user
    users.splice(userIndex, 1);
    await fs.writeFile(WRITE_USERS_FILE, JSON.stringify(users, null, 2));
    
    await logAudit('DELETE_USER', { username, role: deletedRole }, req.session.username);
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/system-stats - Get system statistics (super admin only)
app.get('/api/system-stats', requireSuperAdmin, async (req, res) => {
  try {
    const data = await readData();
    const users = await readUsers();
    const logs = await readAuditLog();
    
    // Calculate statistics
    const totalMembers = data.members.length;
    const totalSessions = data.sessions.length;
    const totalUsers = users.length;
    const superAdmins = users.filter(u => u.role === 'super_admin' || u.role === 'sam').length;
    const admins = users.filter(u => u.role === 'admin').length;
    const totalAuditLogs = logs.length;
    
    // Calculate total hours
    let totalHours = 0;
    data.sessions.forEach(session => {
      session.attendees.forEach(memberCode => {
        const hours = session.individualHours?.[memberCode] || session.hours || 1;
        totalHours += hours;
      });
    });
    
    // Recent activity (last 10 audit logs)
    const recentActivity = logs.slice(-10).reverse();
    
    res.json({
      totalMembers,
      totalSessions,
      totalUsers,
      superAdmins,
      admins,
      totalAuditLogs,
      totalHours,
      recentActivity
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch system statistics' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(err.status || 500).json({ 
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Start server only when run directly (not when imported by Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
      console.warn('⚠️  WARNING: SESSION_SECRET not set! Using default secret.');
    }
  });
}

// Export for Vercel serverless deployment
module.exports = app;
