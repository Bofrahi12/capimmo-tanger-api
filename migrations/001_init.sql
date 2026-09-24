-- 001_init.sql — الجداول الأساسية
-- تُطبَّق مرة واحدة عبر migrations runner (idempotent)

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  city TEXT,
  neighborhood TEXT,
  address TEXT,
  price INTEGER,
  area REAL,
  rooms INTEGER,
  bathrooms INTEGER,
  floor INTEGER,
  furnished INTEGER,
  parking INTEGER,
  elevator INTEGER,
  ownership TEXT,
  negotiable INTEGER,
  condition TEXT,
  photos TEXT NOT NULL DEFAULT '[]',
  photo_real INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  features TEXT NOT NULL DEFAULT '[]',
  source_url TEXT,
  source_name TEXT,
  seller_type TEXT,
  seller_name TEXT,
  date_added TEXT,
  date_verified TEXT,
  verification TEXT,
  verification_note TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  agency_direct INTEGER NOT NULL DEFAULT 0,
  spotlight INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
CREATE INDEX IF NOT EXISTS idx_listings_type ON listings(type);

-- طلبات العملاء (leads) — من المساعد الذكي ونماذج الموقع
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT,
  budget INTEGER,
  preferences TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'site',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

-- طلبات المعاينة
CREATE TABLE IF NOT EXISTS viewing_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  preferred_date TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_viewings_status ON viewing_requests(status);

-- مستخدمو الإدارة
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- سجلات تفاعلات الذكاء الاصطناعي — بدون نص الرسائل (خصوصية)
CREATE TABLE IF NOT EXISTS ai_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  provider TEXT NOT NULL DEFAULT 'local',
  intent TEXT,
  city TEXT,
  property_type TEXT,
  result_count INTEGER,
  latency_ms INTEGER,
  ip_hash TEXT
);
