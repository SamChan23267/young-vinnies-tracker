// Load environment variables first
require('dotenv').config();

const express = require('express');
const cookieSession = require('cookie-session');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const fs = require('fs').promises;
const https = require('https');
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
      scriptSrc: ["'self'", "'unsafe-inline'", "https://vercel.live", "https://va.vercel-scripts.com"],
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://vercel.live", "https://va.vercel-scripts.com"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc.)
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://vercel.live", "wss://ws-us3.pusher.com", "wss://vercel.live", "https://vitals.vercel-insights.com", "https://*.vercel-insights.com"],
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

// Prevent caching of API responses (critical for Vercel serverless correctness)
app.use('/api/', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Middleware
app.use(express.json());

// Session configuration (cookie-based for serverless compatibility)
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'young-vinnies-secret-key-2026'],
  maxAge: parseInt(process.env.COOKIE_MAX_AGE, 10) || 24 * 60 * 60 * 1000, // 24 hours
  secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax'
}));

// Static files - but check auth for main pages
app.use((req, res, next) => {
  // Allow access to login page, public hours page, static assets, and API endpoints
  if (req.path.includes('/login.html') || 
      req.path.includes('/public-hours.html') ||
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

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // Prevent stale caches for JS/CSS/HTML files
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// File paths
const DATA_FILE = path.join(__dirname, 'data.json');
const AUDIT_LOG_FILE = path.join(__dirname, 'audit_log.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// Writable file paths: Vercel serverless has a read-only project directory;
// /tmp is writable (though ephemeral). On Vercel writes go to /tmp and reads
// try /tmp first, falling back to the bundled seed files.
// For non-Vercel deployments (including local production), write directly to
// the project files so data persists across server restarts.
const IS_VERCEL = !!process.env.VERCEL;
const WRITE_DATA_FILE = IS_VERCEL ? '/tmp/data.json' : DATA_FILE;
const WRITE_AUDIT_LOG_FILE = IS_VERCEL ? '/tmp/audit_log.json' : AUDIT_LOG_FILE;
const WRITE_USERS_FILE = IS_VERCEL ? '/tmp/users.json' : USERS_FILE;

// -----------------------------------------------------------------------
// Vercel KV (Upstash Redis) storage helpers
// When KV_REST_API_URL + KV_REST_API_TOKEN are set every read/write is
// routed through a single shared KV store that is visible to ALL Vercel
// function instances, eliminating the "parallel universe" problem caused
// by each instance having its own private /tmp and in-memory cache.
// -----------------------------------------------------------------------
const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
const USE_KV = !!(KV_REST_API_URL && KV_REST_API_TOKEN);

// Low-level POST to the Upstash Redis REST command endpoint
function _kvRequest(command) {
  return new Promise((resolve, reject) => {
    const u = new URL(KV_REST_API_URL);
    const body = Buffer.from(JSON.stringify(command));
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: '/',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`KV request failed with HTTP ${res.statusCode}`));
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`KV parse error (HTTP ${res.statusCode})`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function kvGet(key) {
  const { result } = await _kvRequest(['GET', key]);
  if (result === null || result === undefined) return null;
  try {
    return JSON.parse(result);
  } catch (e) {
    console.error(`KV value for key "${key}" is not valid JSON; returning null`);
    return null;
  }
}

async function kvSet(key, value) {
  await _kvRequest(['SET', key, JSON.stringify(value)]);
}

// Module-level in-memory cache: persists for the lifetime of a single serverless
// container so that all reads within the same invocation sequence see a
// consistent view after any write. Not used when KV is enabled.
let _usersCache = null;
let _dataCache = null;
let _auditLogCache = null;

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
  if (USE_KV) {
    let users = await kvGet('users');
    if (users === null) {
      // Initialize KV from the seed file on first use
      try {
        const raw = await fs.readFile(USERS_FILE, 'utf8');
        users = JSON.parse(raw);
        await kvSet('users', users);
      } catch {
        users = [];
      }
    }
    return users;
  }
  if (_usersCache !== null) return _usersCache;
  try {
    if (IS_VERCEL) {
      try {
        const data = await fs.readFile(WRITE_USERS_FILE, 'utf8');
        _usersCache = JSON.parse(data);
        return _usersCache;
      } catch {
        // Fall back to bundled seed file on cold start
      }
    }
    const data = await fs.readFile(USERS_FILE, 'utf8');
    _usersCache = JSON.parse(data);
    return _usersCache;
  } catch (error) {
    console.error('Error reading users:', error);
    _usersCache = [];
    return _usersCache;
  }
}

// Helper function to write users
async function writeUsers(users) {
  if (USE_KV) {
    await kvSet('users', users);
    return;
  }
  _usersCache = users;
  await fs.writeFile(WRITE_USERS_FILE, JSON.stringify(users, null, 2));
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
  if (USE_KV) {
    const data = await kvGet('data');
    return data || { members: [], sessions: [] };
  }
  if (_dataCache !== null) return _dataCache;
  try {
    if (IS_VERCEL) {
      try {
        const data = await fs.readFile(WRITE_DATA_FILE, 'utf8');
        _dataCache = JSON.parse(data);
        return _dataCache;
      } catch {
        // Fall back to bundled seed file on cold start
      }
    }
    const data = await fs.readFile(DATA_FILE, 'utf8');
    _dataCache = JSON.parse(data);
    return _dataCache;
  } catch (error) {
    console.error('Error reading data:', error);
    _dataCache = { members: [], sessions: [] };
    return _dataCache;
  }
}

// Helper function to write data
async function writeData(data) {
  if (USE_KV) {
    await kvSet('data', data);
    return;
  }
  _dataCache = data;
  await fs.writeFile(WRITE_DATA_FILE, JSON.stringify(data, null, 2));
}

// Helper function to read audit log
async function readAuditLog() {
  if (USE_KV) {
    const logs = await kvGet('auditLog');
    return logs || [];
  }
  if (_auditLogCache !== null) return _auditLogCache;
  try {
    if (IS_VERCEL) {
      try {
        const data = await fs.readFile(WRITE_AUDIT_LOG_FILE, 'utf8');
        _auditLogCache = JSON.parse(data);
        return _auditLogCache;
      } catch {
        // Fall back to bundled seed file on cold start
      }
    }
    const data = await fs.readFile(AUDIT_LOG_FILE, 'utf8');
    _auditLogCache = JSON.parse(data);
    return _auditLogCache;
  } catch (error) {
    console.error('Error reading audit log:', error);
    _auditLogCache = [];
    return _auditLogCache;
  }
}

// Helper function to write audit log
async function writeAuditLog(logs) {
  if (USE_KV) {
    await kvSet('auditLog', logs);
    return;
  }
  _auditLogCache = logs;
  await fs.writeFile(WRITE_AUDIT_LOG_FILE, JSON.stringify(logs, null, 2));
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
    await writeAuditLog(logs);
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

// GET /api/public/members - Return members with hours visible to public (no auth required)
app.get('/api/public/members', async (req, res) => {
  try {
    const data = await readData();
    const members = data.members.filter(m => !m.hiddenFromPublic);
    // Calculate total hours for each member
    const membersWithHours = members.map(m => {
      let hours = 0;
      data.sessions.forEach(session => {
        const sessionHours = session.hours || 1;
        if (session.attendees.includes(m.code)) {
          const individualHours = session.individualHours && session.individualHours[m.code]
            ? session.individualHours[m.code] : sessionHours;
          hours += individualHours;
        }
      });
      hours += (m.manualHours || 0);
      return { name: m.name, totalHours: hours };
    });
    // Sort by hours descending
    membersWithHours.sort((a, b) => b.totalHours - a.totalHours);
    res.json(membersWithHours);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch public members' });
  }
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
    const { name, yearLevel, email, skipLog } = req.body;
    
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
      email: email || '',
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
    const { name, newCode, yearLevel, email, skipLog } = req.body;
    
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
      email: email !== undefined ? email : (data.members[memberIndex].email || ''),
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

// POST /api/members/:code/hours - Manually adjust member hours (super admin & sam)
app.post('/api/members/:code/hours', requireAuth, async (req, res) => {
  try {
    // Only super_admin or sam role can manually adjust hours
    if (req.session.role !== 'sam' && req.session.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can manually adjust hours' });
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

// POST /api/members/year-levels/adjust - Bulk adjust all member year levels (super admin & sam)
app.post('/api/members/year-levels/adjust', requireSuperAdmin, async (req, res) => {
  try {
    const { delta } = req.body;
    
    if (delta !== 1 && delta !== -1) {
      return res.status(400).json({ error: 'Delta must be 1 or -1' });
    }
    
    const data = await readData();
    let adjustedCount = 0;
    
    data.members.forEach(member => {
      if (member.yearLevel) {
        const currentYear = parseInt(member.yearLevel);
        if (!isNaN(currentYear)) {
          member.yearLevel = String(currentYear + delta);
          adjustedCount++;
        }
      }
    });
    
    await writeData(data);
    await logAudit('ADJUST_YEAR_LEVELS', {
      delta: delta,
      adjustedCount: adjustedCount,
      direction: delta > 0 ? 'incremented' : 'decremented'
    }, req.session.username);
    
    res.json({
      success: true,
      adjustedCount: adjustedCount,
      delta: delta
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to adjust year levels' });
  }
});

// PUT /api/members/:code/visibility - Toggle member public visibility (super admin & sam)
app.put('/api/members/:code/visibility', requireSuperAdmin, async (req, res) => {
  try {
    const data = await readData();
    const member = data.members.find(m => m.code === req.params.code);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    member.hiddenFromPublic = !member.hiddenFromPublic;
    await writeData(data);
    res.json({ success: true, hiddenFromPublic: member.hiddenFromPublic });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle member visibility' });
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
    const { date, description, hours, sessionType, customFields, skipLog } = req.body;
    
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
      sessionType: sessionType || '', // 'meeting', 'project', or '' (not set)
      attendees: [], // Will store member codes
      individualHours: {}, // Object to store individual hour overrides: { memberCode: hours }
      customFields: (customFields && typeof customFields === 'object') ? customFields : {}
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
    const { date, description, hours, sessionType, customFields, skipLog } = req.body;
    
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
    if (sessionType !== undefined) {
      data.sessions[sessionIndex].sessionType = sessionType;
    }
    if (customFields !== undefined && typeof customFields === 'object') {
      data.sessions[sessionIndex].customFields = customFields;
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

// GET /api/export/csv/returns - Generate and return a CSV in the Returns format
app.get('/api/export/csv/returns', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    const sessionsParam = req.query.sessions;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let filteredSessions = data.sessions;

    if (sessionsParam) {
      const sessionIds = sessionsParam.split(',');
      filteredSessions = filteredSessions.filter(s => sessionIds.includes(s.id));
    }
    if (startDate) {
      filteredSessions = filteredSessions.filter(s => new Date(s.date) >= new Date(startDate));
    }
    if (endDate) {
      filteredSessions = filteredSessions.filter(s => new Date(s.date) <= new Date(endDate));
    }

    // Sort by date ascending
    filteredSessions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Escape a value for safe CSV output
    const csvEscape = (val) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    let csv = 'DATE,EVENT,# STUDENT VOLUNTEERS,HOURS PER PERSON,#TOTAL HOURS,WHO WAS HELPED,#ITEMS CONTRIBUTED/DETAILS,NOTES\n';

    filteredSessions.forEach(session => {
      const dateObj = new Date(session.date);
      const formattedDate = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
      const numVolunteers = session.attendees.length;
      const hoursPerPerson = session.hours || 1;

      let totalHours = 0;
      session.attendees.forEach(code => {
        const indivHours = (session.individualHours && session.individualHours[code])
          ? session.individualHours[code]
          : hoursPerPerson;
        totalHours += indivHours;
      });

      // Read from customFields, falling back to legacy fields for backward compatibility
      const cf = session.customFields || {};
      const whoWasHelped = cf['Who Was Helped'] || session.whoWasHelped || '';
      const itemsContributed = cf['Items Contributed/Details'] || session.itemsContributed || '';
      const sessionNotes = cf['Notes'] || session.notes || '';

      csv += [
        formattedDate,
        csvEscape(session.description),
        numVolunteers,
        hoursPerPerson,
        totalHours,
        csvEscape(whoWasHelped),
        csvEscape(itemsContributed),
        csvEscape(sessionNotes)
      ].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=returns.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export Returns CSV' });
  }
});

// GET /api/export/csv/roll - Generate and return a CSV in the Roll format
app.get('/api/export/csv/roll', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    const sessionsParam = req.query.sessions;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let filteredSessions = data.sessions;

    if (sessionsParam) {
      const sessionIds = sessionsParam.split(',');
      filteredSessions = filteredSessions.filter(s => sessionIds.includes(s.id));
    }
    if (startDate) {
      filteredSessions = filteredSessions.filter(s => new Date(s.date) >= new Date(startDate));
    }
    if (endDate) {
      filteredSessions = filteredSessions.filter(s => new Date(s.date) <= new Date(endDate));
    }

    // Escape a value for safe CSV output
    const csvEscape = (val) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    let csv = 'Full Name,Year,Email,# Meeting Attended,#Projects Assisted\n';

    data.members.forEach(member => {
      let meetingsAttended = 0;
      let projectsAssisted = 0;

      filteredSessions.forEach(session => {
        if (session.attendees.includes(member.code)) {
          if (session.sessionType === 'project') {
            projectsAssisted++;
          } else {
            meetingsAttended++;
          }
        }
      });

      csv += [
        csvEscape(member.name),
        member.yearLevel || '',
        csvEscape(member.email || ''),
        meetingsAttended,
        projectsAssisted
      ].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=roll.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export Roll CSV' });
  }
});

// GET /api/audit-log - Get audit log (super admin only)
app.get('/api/audit-log', requireSuperAdmin, async (req, res) => {
  try {
    const allLogs = await readAuditLog();
    
    // Filter out sam-only actions for non-sam users
    if (req.session.role !== 'sam') {
      const filtered = allLogs.filter(log => 
        log.action !== 'MANUAL_HOURS' && 
        log.action !== 'DELETE_LOG' &&
        !log.hidden  // Also filter out hidden logs
      );
      return res.json(filtered);
    }

    // For sam: include the original array index so the client can address
    // specific entries when hiding/unhiding (the client sorts by timestamp,
    // so visual position != storage position).
    const logsWithIdx = allLogs.map((log, idx) => ({ ...log, _idx: idx }));
    res.json(logsWithIdx);
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
    await writeAuditLog(logs);
    
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
    await writeAuditLog(logs);
    
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
    await writeUsers(users);
    
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
    await writeUsers(users);
    
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
    
    await writeUsers(users);
    
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
    await writeUsers(users);
    
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
