// GET /api/stato  ->  vini con cartoni venduti + ordini confermati (senza codici segreti)
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "database non collegato" }, 500);
  const [w, o, l] = await env.DB.batch([
    env.DB.prepare("SELECT id, cantina, nome, cartoni, bottiglie, prezzo, ord, venduti FROM wines ORDER BY ord"),
    env.DB.prepare("SELECT id, nome, created_at, chiuso FROM orders ORDER BY created_at"),
    env.DB.prepare("SELECT order_id, wine_id, qty FROM order_lines"),
  ]);
  const byOrder = {};
  for (const r of l.results) (byOrder[r.order_id] ||= {})[r.wine_id] = r.qty;
  const orders = o.results.map((r) => ({ id: r.id, nome: r.nome, t: r.created_at, chiuso: r.chiuso ? 1 : 0, righe: byOrder[r.id] || {} }));
  return json({ vini: w.results, ordini: orders });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
