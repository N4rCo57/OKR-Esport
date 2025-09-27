const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration de la base de données
const dbPath = path.join(__dirname, 'okr_database.db');

// Fonction d'initialisation de la DB
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    db.serialize(() => {
      // Créer les tables
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS okrs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        completed BOOLEAN DEFAULT 0,
        type TEXT DEFAULT 'daily',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);

      // Insérer les utilisateurs par défaut
      const defaultUsers = [
        { name: 'Joueur 1', color: '#FF6B6B' },
        { name: 'Joueur 2', color: '#4ECDC4' },
        { name: 'Joueur 3', color: '#45B7D1' }
      ];

      const stmt = db.prepare("INSERT OR IGNORE INTO users (name, color) VALUES (?, ?)");
      defaultUsers.forEach(user => {
        stmt.run(user.name, user.color);
      });
      stmt.finalize();

      console.log('✅ Base de données initialisée');
    });

    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Initialiser la DB au démarrage
initializeDatabase().then(() => {
  console.log('✅ DB prête');
}).catch(err => {
  console.error('❌ Erreur DB:', err);
});

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Fonction helper pour obtenir la DB
function getDB() {
  return new sqlite3.Database(dbPath);
}

// Routes API
app.get('/api/users', (req, res) => {
  const db = getDB();
  db.all("SELECT * FROM users ORDER BY id", (err, rows) => {
    if (err) {
      console.error('Erreur GET users:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
    db.close();
  });
});

app.get('/api/users/:userId/okrs', (req, res) => {
  const userId = req.params.userId;
  const db = getDB();
  
  db.all(
    "SELECT * FROM okrs WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
    (err, rows) => {
      if (err) {
        console.error('Erreur GET okrs:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
      db.close();
    }
  );
});

app.post('/api/users/:userId/okrs', (req, res) => {
  const userId = req.params.userId;
  const { title, description, type } = req.body;

  if (!title) {
    res.status(400).json({ error: 'Le titre est requis' });
    return;
  }

  const db = getDB();
  db.run(
    "INSERT INTO okrs (user_id, title, description, type) VALUES (?, ?, ?, ?)",
    [userId, title, description || '', type || 'daily'],
    function(err) {
      if (err) {
        console.error('Erreur POST okr:', err);
        res.status(500).json({ error: err.message });
        db.close();
        return;
      }
      res.json({ 
        id: this.lastID,
        message: 'OKR créé avec succès'
      });
      db.close();
    }
  );
});

app.patch('/api/okrs/:id/toggle', (req, res) => {
  const okrId = req.params.id;
  const db = getDB();

  db.get("SELECT completed FROM okrs WHERE id = ?", [okrId], (err, row) => {
    if (err) {
      console.error('Erreur GET okr:', err);
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'OKR non trouvé' });
      db.close();
      return;
    }

    const newCompleted = row.completed ? 0 : 1;
    const completedAt = newCompleted ? new Date().toISOString() : null;

    db.run(
      "UPDATE okrs SET completed = ?, completed_at = ? WHERE id = ?",
      [newCompleted, completedAt, okrId],
      function(err) {
        if (err) {
          console.error('Erreur UPDATE okr:', err);
          res.status(500).json({ error: err.message });
          db.close();
          return;
        }
        res.json({ 
          message: 'OKR mis à jour',
          completed: newCompleted
        });
        db.close();
      }
    );
  });
});

app.delete('/api/okrs/:id', (req, res) => {
  const okrId = req.params.id;
  const db = getDB();

  db.run("DELETE FROM okrs WHERE id = ?", [okrId], function(err) {
    if (err) {
      console.error('Erreur DELETE okr:', err);
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'OKR non trouvé' });
      db.close();
      return;
    }
    res.json({ message: 'OKR supprimé avec succès' });
    db.close();
  });
});

app.get('/api/dashboard', (req, res) => {
  const db = getDB();
  const query = `
    SELECT 
      u.id,
      u.name,
      u.color,
      COUNT(o.id) as total_okrs,
      SUM(CASE WHEN o.completed = 1 THEN 1 ELSE 0 END) as completed_okrs,
      CASE 
        WHEN COUNT(o.id) > 0 THEN 
          ROUND((SUM(CASE WHEN o.completed = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(o.id), 1)
        ELSE 0 
      END as progress_percentage
    FROM users u
    LEFT JOIN okrs o ON u.id = o.user_id
    GROUP BY u.id, u.name, u.color
    ORDER BY u.id
  `;

  db.all(query, (err, rows) => {
    if (err) {
      console.error('Erreur dashboard:', err);
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    res.json(rows);
    db.close();
  });
});

// Routes frontend - avec fallback si les fichiers n'existent pas
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <h1>🏆 OKR Esport Platform</h1>
      <p>Fichiers frontend manquants. Créez le dossier 'public/' avec les fichiers HTML.</p>
      <p><a href="/api/users">Test API Users</a></p>
      <p><a href="/api/dashboard">Test API Dashboard</a></p>
    `);
  }
});

app.get('/dashboard', (req, res) => {
  const dashboardPath = path.join(__dirname, 'public', 'dashboard.html');
  if (fs.existsSync(dashboardPath)) {
    res.sendFile(dashboardPath);
  } else {
    res.redirect('/');
  }
});

app.get('/user/:id', (req, res) => {
  const userPath = path.join(__dirname, 'public', 'user.html');
  if (fs.existsSync(userPath)) {
    res.sendFile(userPath);
  } else {
    res.redirect('/');
  }
});

// Test de santé
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: fs.existsSync(dbPath) ? 'Connected' : 'Not found'
  });
});

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint non trouvé', path: req.path });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err.stack);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`🏠 Accueil: http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
});

// Gestion de l'arrêt propre
process.on('SIGINT', () => {
  console.log('🛑 Arrêt du serveur...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Arrêt du serveur...');
  process.exit(0);
});
