-- Modelama Fabric Shipment Tracker — schema
-- Runs automatically on server start (safe to run repeatedly).

CREATE TABLE IF NOT EXISTS shipments (
  id               TEXT PRIMARY KEY,
  shipment_id      TEXT UNIQUE NOT NULL,
  invoice          TEXT,
  po               TEXT,
  style            TEXT,
  buyer            TEXT,
  supplier         TEXT,
  fabric           TEXT,
  gsm              TEXT,
  color            TEXT,
  rolls            INT DEFAULT 0,
  qty              NUMERIC DEFAULT 0,
  priority         TEXT,
  current_stage    TEXT,
  grn_no           TEXT,
  arrival_date     TIMESTAMPTZ,
  stage_entered_at TIMESTAMPTZ,
  -- Full record (timeline, lab/shade/bulk/merchant/inspection results, etc.)
  -- Top-level columns above are duplicated out of this for fast filtering/reporting.
  data             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipments_stage    ON shipments(current_stage);
CREATE INDEX IF NOT EXISTS idx_shipments_buyer    ON shipments(buyer);
CREATE INDEX IF NOT EXISTS idx_shipments_supplier ON shipments(supplier);
CREATE INDEX IF NOT EXISTS idx_shipments_priority ON shipments(priority);

CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INT NOT NULL DEFAULT 0
);
INSERT INTO counters(name, value) VALUES ('shipmentSeq', 0) ON CONFLICT DO NOTHING;
INSERT INTO counters(name, value) VALUES ('grnSeq', 0)      ON CONFLICT DO NOTHING;
