#!/usr/bin/env node
/**
 * Backup Script for Young Vinnies Tracker
 * Creates timestamped backups of all data files
 */

const fs = require('fs').promises;
const path = require('path');

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                    new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
  const backupDir = path.join(__dirname, 'backups', timestamp);
  
  try {
    // Create backup directory
    await fs.mkdir(backupDir, { recursive: true });
    
    // Files to backup
    const files = ['data.json', 'users.json', 'audit_log.json'];
    
    // Copy each file
    for (const file of files) {
      const sourcePath = path.join(__dirname, file);
      const destPath = path.join(backupDir, file);
      
      try {
        await fs.copyFile(sourcePath, destPath);
        console.log(`✓ Backed up ${file}`);
      } catch (err) {
        console.error(`✗ Failed to backup ${file}:`, err.message);
      }
    }
    
    console.log(`\n✓ Backup completed successfully!`);
    console.log(`Location: ${backupDir}`);
    
  } catch (err) {
    console.error('✗ Backup failed:', err.message);
    process.exit(1);
  }
}

backup();
