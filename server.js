const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration de la base de données
const dbPath = path.join(__dirname, 'okr_database.db');
const db = new sqlite3.Database(dbPath);

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false // Pour permettre les styles inline
}));
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes API

// Récupérer tous les utilisateurs
app.get('/api/users', (req, res) => {
  db.all("SELECT * FROM users ORDER BY id", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Récupérer les OKR d'un utilisateur
app.get('/api/users/:userId/okrs', (req, res) => {
  const userId = req.params.userId;
  db.all(
    "SELECT * FROM okrs WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Ajouter un nouvel OKR
app.post('/api/users/:userId/okrs', (req, res) => {
  const userId = req.params.userId;
  const { title, description, type } = req.body;

  if (!title) {
    res.status(400).json({ error: 'Le titre est requis' });
    return;
  }

  db.run(
    "INSERT INTO okrs (user_id, title, description, type) VALUES (?, ?, ?, ?)",
    [userId, title, description || '', type || 'daily'],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ 
        id: this.lastID,
        message: 'OKR créé avec succès'
      });
    }
  );
});

// Marquer un OKR comme terminé/non terminé
app.patch('/api/okrs/:id/toggle', (req, res) => {
  const okrId = req.params.id;

  db.get("SELECT completed FROM okrs WHERE id = ?", [okrId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'OKR non trouvé' });
      return;
    }

    const newCompleted = row.completed ? 0 : 1;
    const completedAt = newCompleted ? new Date().toISOString() : null;

    db.run(
      "UPDATE okrs SET completed = ?, completed_at = ? WHERE id = ?",
      [newCompleted, completedAt, okrId],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ 
          message: 'OKR mis à jour',
          completed: newCompleted
        });
      }
    );
  });
});

// Supprimer un OKR
app.delete('/api/okrs/:id', (req, res) => {
  const okrId = req.params.id;

  db.run("DELETE FROM okrs WHERE id = ?", [okrId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'OKR non trouvé' });
      return;
    }
    res.json({ message: 'OKR supprimé avec succès' });
  });
});

// Récupérer le dashboard global avec statistiques
app.get('/api/dashboard', (req, res) => {
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
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Servir le frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/user/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint non trouvé' });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`👤 Interface utilisateur: http://localhost:${PORT}/user/1`);
});