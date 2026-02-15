const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = parseInt(process.env.PORT || '3000');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Wiki - Home</title>
      <link rel="stylesheet" href="/style.css">
    </head>
    <body>
      <div class="app-container">
        <aside class="sidebar">
          <div class="sidebar-header">
            <a href="/" class="logo">
              <span class="logo-icon">📚</span>
              <span>Wiki</span>
            </a>
          </div>
          <nav>
            <div class="nav-section">
              <div class="nav-title">Navigation</div>
              <a href="/" class="nav-item active">
                <span class="nav-item-icon">🏠</span>
                <span>Home</span>
              </a>
              <a href="/pages" class="nav-item">
                <span class="nav-item-icon">📄</span>
                <span>Pages</span>
              </a>
              <a href="/health" class="nav-item">
                <span class="nav-item-icon">💚</span>
                <span>System Health</span>
              </a>
            </div>
          </nav>
        </aside>
        
        <main class="main-content">
          <div class="content-header">
            <h1>Welcome to Wiki</h1>
            <p>A modern knowledge base for your team</p>
          </div>
          
          <div class="content-body">
            <div class="info-card card">
              <h2 style="margin-bottom: 12px; font-size: 20px;">🚀 Getting Started</h2>
              <p><strong>Welcome!</strong> This is a modern wiki application running with Docker and PostgreSQL.</p>
              <p style="margin-top: 12px;">Create your first page to get started documenting your knowledge.</p>
              <p style="margin-top: 16px; font-size: 14px; opacity: 0.8;">
                <strong>Database:</strong> Connected to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}
              </p>
            </div>
            
            <div class="card">
              <h2 style="margin-bottom: 16px; font-size: 20px;">✨ Quick Actions</h2>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <a href="/pages" class="btn btn-primary">
                  <span>📄</span>
                  <span>View All Pages</span>
                </a>
                <a href="/pages#create" class="btn btn-secondary">
                  <span>➕</span>
                  <span>Create New Page</span>
                </a>
              </div>
            </div>
            
            <div class="card">
              <h3 style="margin-bottom: 12px; font-size: 18px;">📖 About</h3>
              <p style="color: var(--text-secondary); line-height: 1.6;">
                This wiki is designed to help teams document and share knowledge efficiently. 
                Create pages, organize information, and collaborate seamlessly with a clean, 
                modern interface inspired by the best knowledge management tools.
              </p>
            </div>
          </div>
        </main>
      </div>
    </body>
    </html>
  `);
});

app.get('/health', async (req, res) => {
  // Check if requesting JSON (API endpoint)
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
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
    return;
  }
  
  // Return HTML page
  let dbStatus = 'disconnected';
  let dbTimestamp = null;
  let dbError = null;
  
  if (pool) {
    try {
      const result = await pool.query('SELECT NOW()');
      dbStatus = 'connected';
      dbTimestamp = result.rows[0].now;
    } catch (err) {
      dbStatus = 'error';
      dbError = err.message;
    }
  }
  
  const isHealthy = dbStatus === 'connected';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Wiki - System Health</title>
      <link rel="stylesheet" href="/style.css">
    </head>
    <body>
      <div class="app-container">
        <aside class="sidebar">
          <div class="sidebar-header">
            <a href="/" class="logo">
              <span class="logo-icon">📚</span>
              <span>Wiki</span>
            </a>
          </div>
          <nav>
            <div class="nav-section">
              <div class="nav-title">Navigation</div>
              <a href="/" class="nav-item">
                <span class="nav-item-icon">🏠</span>
                <span>Home</span>
              </a>
              <a href="/pages" class="nav-item">
                <span class="nav-item-icon">📄</span>
                <span>Pages</span>
              </a>
              <a href="/health" class="nav-item active">
                <span class="nav-item-icon">💚</span>
                <span>System Health</span>
              </a>
            </div>
          </nav>
        </aside>
        
        <main class="main-content">
          <div class="content-header">
            <h1>System Health</h1>
            <p>Monitor the status of your wiki application</p>
          </div>
          
          <div class="content-body">
            <div class="card">
              <h2 style="margin-bottom: 20px; font-size: 20px;">Overall Status</h2>
              <div class="status-badge ${isHealthy ? 'success' : 'error'}">
                <span>${isHealthy ? '✓' : '✗'}</span>
                <span>${isHealthy ? 'System Healthy' : 'System Unhealthy'}</span>
              </div>
            </div>
            
            <div class="health-grid">
              <div class="health-card">
                <h3>Database</h3>
                <div class="health-value" style="color: ${dbStatus === 'connected' ? 'var(--success)' : '#EF4444'};">
                  ${dbStatus === 'connected' ? '✓ Connected' : '✗ ' + dbStatus}
                </div>
                ${dbTimestamp ? `<p style="margin-top: 8px; font-size: 13px; color: var(--text-secondary);">Last check: ${new Date(dbTimestamp).toLocaleString()}</p>` : ''}
                ${dbError ? `<p style="margin-top: 8px; font-size: 13px; color: #EF4444;">Error: ${escapeHtml(dbError)}</p>` : ''}
              </div>
              
              <div class="health-card">
                <h3>Server</h3>
                <div class="health-value" style="color: var(--success);">
                  ✓ Running
                </div>
                <p style="margin-top: 8px; font-size: 13px; color: var(--text-secondary);">
                  Port: ${port}
                </p>
              </div>
              
              <div class="health-card">
                <h3>Database Config</h3>
                <div style="margin-top: 12px; font-size: 14px; color: var(--text-secondary);">
                  <div style="margin-bottom: 6px;"><strong>Host:</strong> ${dbConfig.host}</div>
                  <div style="margin-bottom: 6px;"><strong>Port:</strong> ${dbConfig.port}</div>
                  <div><strong>Database:</strong> ${dbConfig.database}</div>
                </div>
              </div>
            </div>
            
            <div class="card">
              <h3 style="margin-bottom: 12px; font-size: 18px;">API Endpoint</h3>
              <p style="color: var(--text-secondary); margin-bottom: 12px;">
                Access the health check as JSON by setting the Accept header to application/json
              </p>
              <code style="background: var(--background-secondary); padding: 8px 12px; border-radius: 4px; display: block; font-size: 14px;">
                GET /health
              </code>
            </div>
          </div>
        </main>
      </div>
    </body>
    </html>
  `);
});

app.get('/pages', async (req, res) => {
  if (!pool) {
    return res.status(503).send('Database not connected');
  }
  
  try {
    const result = await pool.query('SELECT * FROM wiki_pages ORDER BY created_at DESC');
    
    let html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Wiki - Pages</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <div class="app-container">
          <aside class="sidebar">
            <div class="sidebar-header">
              <a href="/" class="logo">
                <span class="logo-icon">📚</span>
                <span>Wiki</span>
              </a>
            </div>
            <nav>
              <div class="nav-section">
                <div class="nav-title">Navigation</div>
                <a href="/" class="nav-item">
                  <span class="nav-item-icon">🏠</span>
                  <span>Home</span>
                </a>
                <a href="/pages" class="nav-item active">
                  <span class="nav-item-icon">📄</span>
                  <span>Pages</span>
                </a>
                <a href="/health" class="nav-item">
                  <span class="nav-item-icon">💚</span>
                  <span>System Health</span>
                </a>
              </div>
            </nav>
          </aside>
          
          <main class="main-content">
            <div class="content-header">
              <h1>All Pages</h1>
              <p>${result.rows.length} page${result.rows.length !== 1 ? 's' : ''} in your wiki</p>
            </div>
            
            <div class="content-body">
              <div class="form-section" id="create">
                <h2>✍️ Create New Page</h2>
                <form action="/pages" method="POST">
                  <div class="form-group">
                    <label for="title">Page Title</label>
                    <input type="text" id="title" name="title" placeholder="Enter a descriptive title..." required>
                  </div>
                  <div class="form-group">
                    <label for="content">Content</label>
                    <textarea id="content" name="content" placeholder="Write your content here..." required></textarea>
                  </div>
                  <button type="submit" class="btn btn-primary">
                    <span>💾</span>
                    <span>Create Page</span>
                  </button>
                </form>
              </div>
    `;
    
    if (result.rows.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <h3>No pages yet</h3>
          <p>Create your first page above to get started!</p>
        </div>
      `;
    } else {
      html += '<div class="pages-grid">';
      result.rows.forEach(page => {
        const createdDate = new Date(page.created_at);
        const formattedDate = createdDate.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        html += `
          <div class="page-card">
            <h3>
              <span class="page-icon">📄</span>
              ${escapeHtml(page.title)}
            </h3>
            <p>${escapeHtml(page.content)}</p>
            <div class="page-meta">
              <div class="page-meta-item">
                <span>🕒</span>
                <span>${formattedDate}</span>
              </div>
              <div class="page-meta-item">
                <span>📝</span>
                <span>${page.content.length} characters</span>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }
    
    html += `
            </div>
          </main>
        </div>
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
