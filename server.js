require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));

const APP_PASSWORD = process.env.APP_PASSWORD || 'change-this-passcode';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
});

// ---- Shared-passcode auth for the API (see README for how to change this) ----
app.use('/api', (req, res, next) => {
  const key = req.header('x-app-key');
  if (!key || key !== APP_PASSWORD) {
    return res.status(401).json({ error: 'Invalid or missing passcode' });
  }
  next();
});

function rowToShipment(row) {
  const merged = Object.assign({}, row.data || {}, {
    id: row.id,
    shipmentId: row.shipment_id,
    invoice: row.invoice,
    po: row.po,
    style: row.style,
    buyer: row.buyer,
    supplier: row.supplier,
    fabric: row.fabric,
    gsm: row.gsm,
    color: row.color,
    rolls: row.rolls,
    qty: Number(row.qty),
    priority: row.priority,
    currentStage: row.current_stage,
    grnNo: row.grn_no,
    arrivalDate: row.arrival_date ? new Date(row.arrival_date).getTime() : null,
    stageEnteredAt: row.stage_entered_at ? new Date(row.stage_entered_at).getTime() : null
  });
  return merged;
}

app.get('/api/shipments', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM shipments ORDER BY created_at ASC');
    res.json(rows.map(rowToShipment));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load shipments' });
  }
});

app.get('/api/counters', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT name, value FROM counters');
    const counters = { shipmentSeq: 0, grnSeq: 0 };
    rows.forEach(r => { counters[r.name] = r.value; });
    res.json(counters);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load counters' });
  }
});

// Bulk upsert — the dashboard sends its whole in-memory shipment list here after
// every action (new shipment, GRN, lab result, approval, etc). Simple and reliable
// for a single shared operational dashboard used by a handful of departments.
app.post('/api/sync', async (req, res) => {
  const { shipments, counters } = req.body || {};
  if (!Array.isArray(shipments)) return res.status(400).json({ error: 'shipments must be an array' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const s of shipments) {
      await client.query(
        `INSERT INTO shipments
           (id, shipment_id, invoice, po, style, buyer, supplier, fabric, gsm, color,
            rolls, qty, priority, current_stage, grn_no, arrival_date, stage_entered_at, data, updated_at)
         VALUES
           ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,to_timestamp($16/1000.0),to_timestamp($17/1000.0),$18, now())
         ON CONFLICT (id) DO UPDATE SET
           shipment_id=$2, invoice=$3, po=$4, style=$5, buyer=$6, supplier=$7, fabric=$8, gsm=$9, color=$10,
           rolls=$11, qty=$12, priority=$13, current_stage=$14, grn_no=$15,
           arrival_date=to_timestamp($16/1000.0), stage_entered_at=to_timestamp($17/1000.0),
           data=$18, updated_at=now()`,
        [
          s.id, s.shipmentId, s.invoice || null, s.po || null, s.style || null, s.buyer || null,
          s.supplier || null, s.fabric || null, s.gsm || null, s.color || null,
          s.rolls || 0, s.qty || 0, s.priority || null, s.currentStage || null, s.grnNo || null,
          s.arrivalDate || Date.now(), s.stageEnteredAt || Date.now(), JSON.stringify(s)
        ]
      );
    }
    for (const name of Object.keys(counters || {})) {
      await client.query(
        `INSERT INTO counters(name, value) VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET value = GREATEST(counters.value, $2)`,
        [name, counters[name]]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Sync failed' });
  } finally {
    client.release();
  }
});

app.delete('/api/shipments/seed', async (req, res) => {
  try {
    await pool.query(`DELETE FROM shipments WHERE (data->>'isSeed')::boolean IS TRUE`);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to clear sample data' });
  }
});

app.delete('/api/shipments/all', async (req, res) => {
  try {
    await pool.query('TRUNCATE shipments');
    await pool.query('UPDATE counters SET value = 0');
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to erase data' });
  }
});

app.get('/api/export.csv', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM shipments ORDER BY created_at ASC');
    const cols = ['shipment_id', 'invoice', 'po', 'style', 'buyer', 'supplier', 'fabric', 'color', 'gsm', 'rolls', 'qty', 'priority', 'current_stage', 'grn_no'];
    const header = cols.join(',');
    const body = rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="modelama_shipments.csv"');
    res.send(header + '\n' + body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Export failed' });
  }
});

app.get('/healthz', async (req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ ok: false, error: 'DATABASE_URL is not set on this service.' });
  }
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Serve the frontend ----
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql')).toString();

if (!process.env.DATABASE_URL) {
  console.error('====================================================================');
  console.error('FATAL: DATABASE_URL is not set.');
  console.error('This app has no idea where your Postgres database is, so it is');
  console.error('falling back to localhost - which does not exist on Railway/Render.');
  console.error('');
  console.error('Fix: in your app service (not the Postgres service) go to the');
  console.error('Variables tab and add DATABASE_URL, referencing your Postgres');
  console.error('service (e.g. ${{Postgres.DATABASE_URL}} in Railway), then redeploy.');
  console.error('====================================================================');
  // Stay alive instead of crash-looping, so this message is visible in the logs
  // instead of scrolling past in an endless restart cycle.
  app.listen(PORT, () => console.log('Listening on port ' + PORT + ' WITHOUT a database - fix DATABASE_URL and redeploy.'));
} else {
  const MAX_ATTEMPTS = 8;
  const RETRY_DELAY_MS = 3000;

  function tryInitSchema(attempt) {
    pool.query(schema)
      .then(() => {
        app.listen(PORT, () => console.log('Modelama Fabric Tracker running on port ' + PORT));
      })
      .catch(err => {
        console.error(`Database not ready yet (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}`);
        if (attempt < MAX_ATTEMPTS) {
          setTimeout(() => tryInitSchema(attempt + 1), RETRY_DELAY_MS);
        } else {
          console.error('====================================================================');
          console.error('FATAL: Could not connect to the database after multiple retries.');
          console.error('Check that DATABASE_URL points to a real, running Postgres instance');
          console.error('and that PGSSL=true is set if it is a hosted database.');
          console.error('====================================================================');
          process.exit(1);
        }
      });
  }
  tryInitSchema(1);
}
