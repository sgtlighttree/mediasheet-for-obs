const express = require('express');
const path = require('path');
const { resolveFile } = require('./lib/resolve');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/resolve', async (req, res) => {
  const { name, size, lastModified } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'bad_request', message: 'Missing file name' });
  }
  try {
    const result = await resolveFile(name, size, lastModified);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'search_failed', message: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MediaSheet server listening on http://0.0.0.0:${PORT}`);
});
