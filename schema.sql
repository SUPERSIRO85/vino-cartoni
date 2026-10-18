-- Vino da vendere: tabelle e vini iniziali (Cloudflare D1)

CREATE TABLE IF NOT EXISTS wines (
  id TEXT PRIMARY KEY,
  cantina TEXT NOT NULL,
  nome TEXT NOT NULL,
  cartoni INTEGER NOT NULL,
  bottiglie INTEGER NOT NULL DEFAULT 0,
  prezzo INTEGER NOT NULL,
  ord INTEGER NOT NULL,
  venduti INTEGER NOT NULL DEFAULT 0,
  CHECK (venduti >= 0 AND venduti <= cartoni)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_lines (
  order_id TEXT NOT NULL,
  wine_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (order_id, wine_id)
);

INSERT OR IGNORE INTO wines (id, cantina, nome, cartoni, bottiglie, prezzo, ord) VALUES
  ('nani-extra-brut', 'Nani Rizzi', 'Extra Brut', 25, 3, 45, 1),
  ('nani-brut',       'Nani Rizzi', 'Brut',       15, 5, 45, 2),
  ('nani-extra-dry',  'Nani Rizzi', 'Extra Dry',   3, 1, 45, 3),
  ('zenato-soave',    'Zenato',     'Soave',       6, 3, 40, 4),
  ('zenato-bardolino','Zenato',     'Bardolino',   5, 0, 40, 5),
  ('zenato-custoza',  'Zenato',     'Custoza',     6, 4, 40, 6);
