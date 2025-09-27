const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'okr_database.db');
const db = new sqlite3.Database(dbPath);

// Création des tables
db.serialize(() => {
  // Table des utilisateurs
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Table des OKR
  db.run(`CREATE TABLE IF NOT EXISTS okrs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    completed BOOLEAN DEFAULT 0,
    type TEXT DEFAULT 'daily', -- 'daily' ou 'weekly'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Insertion des utilisateurs par défaut
  const defaultUsers = [
    { name: 'Xavier', color: '#FF6B6B' },
    { name: 'Arnaud', color: '#4ECDC4' },
    { name: 'Clement', color: '#45B7D1' }
  ];

  const stmt = db.prepare("INSERT OR IGNORE INTO users (name, color) VALUES (?, ?)");
  defaultUsers.forEach(user => {
    stmt.run(user.name, user.color);
  });
  stmt.finalize();

  console.log('✅ Base de données initialisée avec succès!');
  console.log('📊 3 utilisateurs par défaut créés');
});

db.close();