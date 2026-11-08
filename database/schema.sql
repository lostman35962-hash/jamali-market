PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  store_name TEXT NOT NULL DEFAULT 'جمالی مارکت',
  currency TEXT NOT NULL DEFAULT 'تومان',
  cash_discount REAL NOT NULL DEFAULT 2,
  bulk_discount REAL NOT NULL DEFAULT 2,
  bulk_min_qty INTEGER NOT NULL DEFAULT 3,
  min_order_qty INTEGER NOT NULL DEFAULT 3,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  emoji TEXT NOT NULL DEFAULT '🛒',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT,
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  emoji TEXT NOT NULL DEFAULT '🛒',
  images_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL DEFAULT '',
  installment_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  delivery_time TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'در انتظار بررسی',
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  payment_reference TEXT,
  check_image TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS installments (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO settings (id) VALUES (1);

INSERT OR IGNORE INTO categories (id, name, emoji, sort_order) VALUES
  ('cat-dairy', 'لبنیات', '🥛', 1),
  ('cat-drinks', 'نوشیدنی', '🥤', 2),
  ('cat-snacks', 'تنقلات', '🍿', 3),
  ('cat-food', 'مواد غذایی', '🛍️', 4),
  ('cat-hygiene', 'بهداشتی', '🧴', 5);

INSERT OR IGNORE INTO products (id, name, category_id, price, stock, emoji) VALUES
  ('p1', 'شیر کم‌چرب ۱ لیتری', 'cat-dairy', 38000, 30, '🥛'),
  ('p2', 'نوشابه خانواده', 'cat-drinks', 65000, 25, '🥤'),
  ('p3', 'چیپس نمکی', 'cat-snacks', 45000, 40, '🍟'),
  ('p4', 'شکلات پذیرایی', 'cat-snacks', 85000, 20, '🍫'),
  ('p5', 'برنج ایرانی ۱۰ کیلویی', 'cat-food', 980000, 12, '🍚'),
  ('p6', 'مایع دستشویی', 'cat-hygiene', 78000, 18, '🧴');
