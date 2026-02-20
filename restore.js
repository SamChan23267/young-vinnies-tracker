#!/usr/bin/env node
/**
 * Restore Script for Young Vinnies Tracker
 * Restores data from a backup directory
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

async function listBackups() {
  const backupsDir = path.join(__dirname, 'backups');
  
  try {
    const entries = await fs.readdir(backupsDir, { withFileTypes: true });
    const directories = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
      .reverse();
    
    return directories;
  } catch (err) {
    return [];
  }
}

async function restore(backupName) {
  const backupDir = path.join(__dirname, 'backups', backupName);
  
  try {
    // Verify backup exists
    await fs.access(backupDir);
    
    // Files to restore
    const files = ['data.json', 'users.json', 'audit_log.json'];
    
    // Restore each file
    for (const file of files) {
      const sourcePath = path.join(backupDir, file);
      const destPath = path.join(__dirname, file);
      
      try {
        await fs.copyFile(sourcePath, destPath);
        console.log(`✓ Restored ${file}`);
      } catch (err) {
        console.error(`✗ Failed to restore ${file}:`, err.message);
      }
    }
    
    console.log(`\n✓ Restore completed successfully!`);
    
  } catch (err) {
    console.error('✗ Restore failed:', err.message);
    process.exit(1);
  }
}

async function main() {
  const backups = await listBackups();
  
  if (backups.length === 0) {
    console.error('No backups found. Run "npm run backup" to create a backup first.');
    process.exit(1);
  }
  
  console.log('Available backups:');
  backups.forEach((backup, index) => {
    console.log(`  ${index + 1}. ${backup}`);
  });
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('\nEnter backup number to restore (or press Ctrl+C to cancel): ', (answer) => {
    const index = parseInt(answer) - 1;
    
    if (index >= 0 && index < backups.length) {
      rl.question(`\n⚠️  This will overwrite current data. Continue? (yes/no): `, (confirm) => {
        rl.close();
        
        if (confirm.toLowerCase() === 'yes') {
          restore(backups[index]);
        } else {
          console.log('Restore cancelled.');
        }
      });
    } else {
      console.error('Invalid backup number.');
      rl.close();
      process.exit(1);
    }
  });
}

main();
