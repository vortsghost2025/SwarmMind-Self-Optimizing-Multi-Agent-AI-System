#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'state', 'proposals.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(`Failed to open database: ${err.message}`);
    process.exit(1);
  }
});

const schema = `
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT UNIQUE,
  from_lane TEXT,
  to_lane TEXT,
  subject TEXT,
  body TEXT,
  confidence INTEGER,
  confidence_derivation TEXT,
  timestamp TEXT,
  proposal_type TEXT,
  status TEXT DEFAULT 'pending',
  outcome_notes TEXT,
  reward_signal REAL,
  evidence_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

db.exec(schema, (err) => {
  if (err) {
    console.error(`Schema creation failed: ${err.message}`);
    process.exit(1);
  } else {
    console.log('Proposals database initialized successfully');
  }
  db.close();
});
