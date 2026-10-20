// POST   /api/ordine            -> crea un ordine (tutto o niente)
// PUT    /api/ordine?id=...     -> modifica un ordine (solo amministratore, tutto o niente)
// DELETE /api/ordine?id=...     -> annulla un ordine (serve il codice dell'ordine, oppure la chiave admin)

async function leggiRighe(body, env) {
  const nome = String(body.nome || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!nome) return { errore: json({ error: "Scrivi il tuo nome." }, 400) };

  const known = await env.DB.prepare("SELECT id FROM wines").all();
  const ids = new Set(known.results.map((r) => r.id));
  const righe = [];
  for (const [wid, v] of Object.entries(body.righe || {})) {
    const qty = Number(v);
    if (!ids.has(wid)) continue;
    if (!Number.isInteger(qty) || qty < 0 || qty > 99) return { errore: json({ error: "Quantità non valida." }, 400) };
    if (qty > 0) righe.push([wid, qty]);
  }
  if (!righe.length) return { errore: json({ error: "Scegli almeno un cartone o una bottiglia." }, 400) };
  return { nome, righe };
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "database non collegato" }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: "richiesta non valida" }, 400); }

  const r = await leggiRighe(body, env);
  if (r.errore) return r.errore;
  const { nome, righe } = r;

  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const stmts = [];
  // Se un vino non ha abbastanza cartoni, il vincolo CHECK fa fallire tutto e non cambia nulla.
  for (const [wid, qty] of righe) {
    stmts.push(env.DB.prepare("UPDATE wines SET venduti = venduti + ?1 WHERE id = ?2").bind(qty, wid));
  }
  stmts.push(env.DB.prepare("INSERT INTO orders (id, nome, token, created_at) VALUES (?1, ?2, ?3, ?4)").bind(id, nome, token, Date.now()));
  for (const [wid, qty] of righe) {
    stmts.push(env.DB.prepare("INSERT INTO order_lines (order_id, wine_id, qty) VALUES (?1, ?2, ?3)").bind(id, wid, qty));
  }

  try {
    await env.DB.batch(stmts);
  } catch (e) {
    if (/CHECK constraint/i.test(String(e && (e.message || e)))) {
      return json({ error: "esaurito" }, 409);
    }
    return json({ error: "Non sono riuscito a salvare l'ordine." }, 500);
  }
  return json({ id, token });
}

export async function onRequestPut({ request, env }) {
  if (!env.DB) return json({ error: "database non collegato" }, 500);
  const id = new URL(request.url).searchParams.get("id") || "";
  const admin = request.headers.get("x-admin") || "";
  if (!env.ADMIN_KEY || !admin || admin !== env.ADMIN_KEY) return json({ error: "non autorizzato" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "richiesta non valida" }, 400); }

  const exists = await env.DB.prepare("SELECT id FROM orders WHERE id = ?1").bind(id).first();
  if (!exists) return json({ error: "ordine non trovato" }, 404);

  const r = await leggiRighe(body, env);
  if (r.errore) return r.errore;
  const { nome, righe } = r;

  // Prima si rimettono a posto i cartoni del vecchio ordine, poi si aggiungono quelli nuovi.
  // Se i nuovi superano i cartoni disponibili, il vincolo CHECK annulla tutto.
  const stmts = [
    env.DB.prepare(
      "UPDATE wines SET venduti = venduti - (SELECT qty FROM order_lines WHERE order_id = ?1 AND wine_id = wines.id) " +
      "WHERE id IN (SELECT wine_id FROM order_lines WHERE order_id = ?1)"
    ).bind(id),
    env.DB.prepare("DELETE FROM order_lines WHERE order_id = ?1").bind(id),
  ];
  for (const [wid, qty] of righe) {
    stmts.push(
      env.DB.prepare("UPDATE wines SET venduti = venduti + ?1 WHERE id = ?2 AND EXISTS (SELECT 1 FROM orders WHERE id = ?3)").bind(qty, wid, id)
    );
    stmts.push(
      env.DB.prepare("INSERT INTO order_lines (order_id, wine_id, qty) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?1)").bind(id, wid, qty)
    );
  }
  stmts.push(env.DB.prepare("UPDATE orders SET nome = ?1 WHERE id = ?2").bind(nome, id));

  try {
    await env.DB.batch(stmts);
  } catch (e) {
    if (/CHECK constraint/i.test(String(e && (e.message || e)))) {
      return json({ error: "esaurito" }, 409);
    }
    return json({ error: "Non sono riuscito a modificare l'ordine." }, 500);
  }
  return json({ id });
}

export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ error: "database non collegato" }, 500);
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  let token = request.headers.get("x-token") || "";

  const admin = request.headers.get("x-admin") || "";
  if (env.ADMIN_KEY && admin && admin === env.ADMIN_KEY) {
    const row = await env.DB.prepare("SELECT token FROM orders WHERE id = ?1").bind(id).first();
    if (!row) return json({ error: "ordine non trovato" }, 404);
    token = row.token;
  }
  if (!id || !token) return json({ error: "non autorizzato" }, 403);

  const res = await env.DB.batch([
    env.DB.prepare(
      "UPDATE wines SET venduti = venduti - (SELECT qty FROM order_lines WHERE order_id = ?1 AND wine_id = wines.id) " +
      "WHERE id IN (SELECT wine_id FROM order_lines WHERE order_id = ?1) " +
      "AND EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND token = ?2)"
    ).bind(id, token),
    env.DB.prepare(
      "DELETE FROM order_lines WHERE order_id = ?1 AND EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND token = ?2)"
    ).bind(id, token),
    env.DB.prepare("DELETE FROM orders WHERE id = ?1 AND token = ?2").bind(id, token),
  ]);
  const changed = res[2] && res[2].meta ? res[2].meta.changes : 0;
  if (!changed) return json({ error: "ordine non trovato" }, 404);
  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
