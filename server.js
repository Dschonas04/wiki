const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = parseInt(process.env.PORT || '3000');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database configuration with retry logic
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'wikidb',
  user: process.env.DB_USER || 'wikiuser',
  password: process.env.DB_PASS || 'changeme',
};

let pool = null;

// Function to connect to database with retry
async function connectWithRetry(maxRetries = 10, delay = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempting to connect to database... (attempt ${i + 1}/${maxRetries})`);
      const testPool = new Pool(dbConfig);
      
      // Test the connection
      const client = await testPool.connect();
      console.log('Successfully connected to PostgreSQL database');
      
      // Initialize database schema
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_pages (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL UNIQUE,
          content TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Database schema initialized');
      
      client.release();
      pool = testPool;
      return true;
    } catch (err) {
      console.error(`Database connection failed (attempt ${i + 1}/${maxRetries}):`, err.message);
      if (i < maxRetries - 1) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('Failed to connect to database after maximum retries');
  return false;
}

// Routes
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Wiki Application</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 0 20px; }
        h1 { color: #333; }
        .nav { margin: 20px 0; }
        .nav a { margin-right: 15px; text-decoration: none; color: #007bff; }
        .nav a:hover { text-decoration: underline; }
        .info { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1>🚀 Wiki Application</h1>
      <div class="nav">
        <a href="/">Home</a>
        <a href="/pages">View Pages</a>
        <a href="/health">Health Check</a>
      </div>
      <div class="info">
        <p><strong>Welcome to the Wiki Application!</strong></p>
        <p>This is a simple wiki application running in Docker with PostgreSQL.</p>
        <p>Database: Connected to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}</p>
      </div>
    </body>
    </html>
  `);
});

app.get('/health', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ 
      status: 'unhealthy', 
      database: 'disconnected' 
    });
  }
  
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      timestamp: result.rows[0].now 
    });
  } catch (err) {
    res.status(503).json({ 
      status: 'unhealthy', 
      database: 'error',
      error: err.message 
    });
  }
});

app.get('/pages', async (req, res) => {
  if (!pool) {
    return res.status(503).send('Database not connected');
  }
  
  try {
    const result = await pool.query('SELECT * FROM wiki_pages ORDER BY created_at DESC');
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Wiki Pages</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 0 20px; }
          h1 { color: #333; }
          .nav { margin: 20px 0; }
          .nav a { margin-right: 15px; text-decoration: none; color: #007bff; }
          .nav a:hover { text-decoration: underline; }
          .page { background: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 5px; }
          .page h3 { margin-top: 0; }
          form { background: #f0f0f0; padding: 20px; border-radius: 5px; margin: 20px 0; }
          input, textarea { width: 100%; padding: 8px; margin: 5px 0 15px 0; box-sizing: border-box; }
          button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
          button:hover { background: #0056b3; }
        </style>
      </head>
      <body>
        <h1>📚 Wiki Pages</h1>
        <div class="nav">
          <a href="/">Home</a>
          <a href="/pages">View Pages</a>
          <a href="/health">Health Check</a>
        </div>
        
        <h2>Create New Page</h2>
        <form action="/pages" method="POST">
          <label>Title:</label>
          <input type="text" name="title" required>
          <label>Content:</label>
          <textarea name="content" rows="5" required></textarea>
          <button type="submit">Create Page</button>
        </form>
        
        <h2>Existing Pages (${result.rows.length})</h2>
    `;
    
    if (result.rows.length === 0) {
      html += '<p>No pages yet. Create your first page above!</p>';
    } else {
      result.rows.forEach(page => {
        html += `
          <div class="page">
            <h3>${escapeHtml(page.title)}</h3>
            <p>${escapeHtml(page.content)}</p>
            <small>Created: ${new Date(page.created_at).toLocaleString()}</small>
          </div>
        `;
      });
    }
    
    html += `
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (err) {
    res.status(500).send('Error retrieving pages: ' + err.message);
  }
});

app.post('/pages', async (req, res) => {
  if (!pool) {
    return res.status(503).send('Database not connected');
  }
  
  const { title, content } = req.body;
  
  try {
    await pool.query(
      'INSERT INTO wiki_pages (title, content) VALUES ($1, $2)',
      [title, content]
    );
    res.redirect('/pages');
  } catch (err) {
    res.status(500).send('Error creating page: ' + err.message);
  }
});

// Helper function to escape HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Start server
async function startServer() {
  // Connect to database with retry
  const connected = await connectWithRetry();
  
  if (!connected) {
    console.error('Could not establish database connection. Exiting...');
    process.exit(1);
  }
  
  app.listen(port, '0.0.0.0', () => {
    console.log(`Wiki application listening on port ${port}`);
    console.log(`Access the application at http://localhost:8080`);
  });
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  if (pool) {
    await pool.end();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  if (pool) {
    await pool.end();
  }
  process.exit(0);
});

startServer();
