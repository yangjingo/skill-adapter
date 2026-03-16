# Registry Platform Integration Guide

> How to build a registry platform that integrates with Skill-Adapter CLI

## Overview

Skill-Adapter CLI (`sa`) is designed to work with any compliant registry platform. This document describes the API specification that your registry must implement to be compatible.

---

## Quick Start: Push Your Code

```bash
# 1. Initialize git (if not already)
git init
git add .
git commit -m "feat: init skill-adapter"

# 2. Add remote and push
git remote add origin https://codehub-g.huawei.com/leow3lab/skill-adapter.git
git push -u origin main

# 3. Or push with SSH
git remote set-url origin git@codehub-g.huawei.com:leow3lab/skill-adapter.git
git push -u origin main
```

---

## Registry API Specification

### Base URL

```
http://leow3lab.service.huawei.com/registry
```

Set via environment variable:
```bash
export SKILL_ADAPTER_REGISTRY=http://leow3lab.service.huawei.com/registry
```

---

### API Endpoints

#### 1. List Skills

```
GET /api/skills
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | - | Search query |
| `sort` | string | `downloads` | Sort by: `downloads`, `name`, `updated`, `created` |
| `limit` | number | 20 | Max results |
| `offset` | number | 0 | Pagination offset |

**Response:**
```json
[
  {
    "id": "skill_abc123",
    "name": "docker-env",
    "version": "1.2.0",
    "description": "Docker environment management",
    "author": "openclaw",
    "keywords": ["docker", "container"],
    "downloads": 1500,
    "rating": 4.5,
    "created_at": "2026-01-15T10:00:00Z",
    "updated_at": "2026-03-16T08:00:00Z"
  }
]
```

---

#### 2. Get Skill Details

```
GET /api/skills/:name
```

**Response:**
```json
{
  "id": "skill_abc123",
  "name": "docker-env",
  "version": "1.2.0",
  "description": "Docker environment management",
  "author": "openclaw",
  "license": "MIT",
  "keywords": ["docker", "container"],
  "downloads": 1500,
  "rating": 4.5,
  "versions": ["1.0.0", "1.1.0", "1.2.0"],
  "latestVersion": "1.2.0",
  "created_at": "2026-01-15T10:00:00Z",
  "updated_at": "2026-03-16T08:00:00Z"
}
```

---

#### 3. Download Skill

```
GET /api/skills/:name/download
GET /api/skills/:name/download?version=1.1.0
```

**Response:** ZIP file download

**ZIP Structure:**
```
docker-env/
├── skill.json        # Manifest (required)
├── skill.md          # System prompt (required)
├── README.md         # Documentation
├── metadata.json     # Metadata
├── patches.json      # Optional: patches
├── constraints.json  # Optional: constraints
└── reference/        # Optional: reference docs
```

**skill.json format:**
```json
{
  "name": "docker-env",
  "version": "1.2.0",
  "description": "Docker environment management",
  "author": "openclaw",
  "license": "MIT",
  "keywords": ["docker", "container"],
  "main": "skill.md",
  "compatibility": {
    "platforms": ["openclaw", "claude-code"]
  }
}
```

---

#### 4. Publish Skill

```
POST /api/skills
```

**Request Body:**
```json
{
  "manifest": {
    "name": "my-skill",
    "version": "1.0.0",
    "description": "My awesome skill",
    "author": "developer",
    "license": "MIT",
    "keywords": ["automation"]
  },
  "content": {
    "systemPrompt": "# My Skill\n\nYou are a helpful assistant..."
  },
  "metadata": {
    "checksum": "sha256:abc123..."
  }
}
```

**Response:**
```json
{
  "id": "skill_xyz789",
  "name": "my-skill",
  "version": "1.0.0",
  "published": true,
  "url": "http://leow3lab.service.huawei.com/registry/skills/my-skill"
}
```

---

#### 5. Delete Skill

```
DELETE /api/skills/:name
```

**Response:**
```json
{
  "deleted": true,
  "name": "my-skill"
}
```

---

#### 6. Get Leaderboard (Hot Skills)

```
GET /api/leaderboard
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 20 | Max results |

**Response:**
```json
{
  "skills": [
    {
      "rank": 1,
      "skill": {
        "name": "docker-env",
        "stats": {
          "downloads": 1500,
          "rating": 4.5
        }
      },
      "change": 327
    }
  ]
}
```

---

## CLI Commands Integration

### Import from Registry

```bash
# Import by skill name (searches registry)
sa import docker-env

# Import specific version
sa import docker-env --version 1.1.0

# Import from custom registry
sa import docker-env --registry http://custom-registry.com
```

### Publish to Registry

```bash
# Export to file first
sa share my-skill -o my-skill.zip

# Publish to registry (via API)
curl -X POST http://leow3lab.service.huawei.com/registry/api/skills \
  -H "Content-Type: application/json" \
  -d @my-skill.json
```

### Create Pull Request

```bash
# Create PR to skills repository
sa share my-skill --pr

# Custom repository
sa share my-skill --pr --repo https://github.com/user/skills
```

---

## Simple Registry Implementation (Node.js)

Here's a minimal registry server:

```javascript
// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

const DATA_FILE = './skills.json';

// Load/Save helpers
const loadData = () => {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { skills: [], versions: {} };
  }
};

const saveData = (data) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// GET /api/skills - List skills
app.get('/api/skills', (req, res) => {
  const { search, sort = 'downloads', limit = 20, offset = 0 } = req.query;
  let data = loadData();

  let skills = data.skills || [];

  if (search) {
    const pattern = search.toLowerCase();
    skills = skills.filter(s =>
      s.name.toLowerCase().includes(pattern) ||
      s.description.toLowerCase().includes(pattern)
    );
  }

  // Sort
  skills.sort((a, b) => (b[sort] || 0) - (a[sort] || 0));

  // Paginate
  const result = skills.slice(+offset, +offset + +limit);

  res.json(result);
});

// GET /api/skills/:name - Get skill
app.get('/api/skills/:name', (req, res) => {
  const data = loadData();
  const skill = data.skills.find(s => s.name === req.params.name);

  if (!skill) {
    return res.status(404).json({ error: 'Skill not found' });
  }

  res.json({
    ...skill,
    versions: data.versions[skill.id] || [],
    latestVersion: skill.version
  });
});

// GET /api/skills/:name/download - Download skill
app.get('/api/skills/:name/download', (req, res) => {
  const data = loadData();
  const skill = data.skills.find(s => s.name === req.params.name);

  if (!skill) {
    return res.status(404).json({ error: 'Skill not found' });
  }

  // Increment downloads
  skill.downloads = (skill.downloads || 0) + 1;
  saveData(data);

  // Return ZIP file (you would generate this)
  res.download(`./skills/${skill.name}.zip`);
});

// POST /api/skills - Publish skill
app.post('/api/skills', (req, res) => {
  const { manifest, content, metadata } = req.body;

  if (!manifest?.name || !content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const data = loadData();
  const id = `skill_${Date.now()}`;
  const now = new Date().toISOString();

  const skill = {
    id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description || '',
    author: manifest.author || 'unknown',
    license: manifest.license || 'MIT',
    keywords: manifest.keywords || [],
    downloads: 0,
    rating: 4.5,
    created_at: now,
    updated_at: now
  };

  data.skills.push(skill);
  data.versions[id] = [manifest.version];
  saveData(data);

  res.status(201).json({
    id,
    name: manifest.name,
    version: manifest.version,
    published: true,
    url: `http://localhost:3000/skills/${manifest.name}`
  });
});

// GET /api/leaderboard - Hot skills
app.get('/api/leaderboard', (req, res) => {
  const data = loadData();
  const skills = (data.skills || [])
    .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
    .slice(0, 20)
    .map((skill, index) => ({
      rank: index + 1,
      skill: {
        name: skill.name,
        stats: {
          downloads: skill.downloads || 0,
          rating: skill.rating || 4.5
        }
      },
      change: Math.floor(Math.random() * 100) // Placeholder
    }));

  res.json({ skills });
});

app.listen(3000, () => {
  console.log('Registry running at http://localhost:3000');
});
```

Run:
```bash
npm init -y
npm install express
node server.js
```

---

## Data Storage

You can use any storage backend:

| Option | Pros | Cons |
|--------|------|------|
| **JSON File** | Simple, no dependencies | Not scalable |
| **SQLite** | Simple, queryable | Single server |
| **PostgreSQL** | Scalable, ACID | More setup |
| **MongoDB** | Flexible schema | Additional complexity |

---

## Security Considerations

### Authentication (Optional)

```javascript
// Add auth middleware
app.use('/api/skills', (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (req.method !== 'GET' && !validateToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per window
}));
```

---

## Testing Your Registry

```bash
# Test list
curl http://localhost:3000/api/skills

# Test publish
curl -X POST http://localhost:3000/api/skills \
  -H "Content-Type: application/json" \
  -d '{"manifest":{"name":"test","version":"1.0.0"},"content":{"systemPrompt":"test"}}'

# Test with CLI
sa import test --registry http://localhost:3000
```

---

## Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/skills` | GET | List/search skills |
| `/api/skills/:name` | GET | Get skill details |
| `/api/skills/:name/download` | GET | Download skill ZIP |
| `/api/skills` | POST | Publish new skill |
| `/api/skills/:name` | DELETE | Delete skill |
| `/api/leaderboard` | GET | Get hot skills |

That's all you need to build a compatible registry! 🚀