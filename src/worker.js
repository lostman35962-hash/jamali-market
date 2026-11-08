const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-allow-headers": "content-type,authorization" };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  return new Uint8Array((hex.match(/.{1,2}/g) || []).map(x => parseInt(x, 16)));
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
async function passwordHash(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, key, 256);
  return { salt: bytesToHex(salt), hash: bytesToHex(bits) };
}
async function requireAdmin(request, env) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT s.admin_id FROM admin_sessions s WHERE s.token_hash = ? AND s.expires_at > datetime('now')"
  ).bind(tokenHash).first();
  return row || null;
}
function defaultState() {
  return {
    settings: { storeName: "جمالی مارکت", currency: "تومان", cashDiscount: 2, bulkDiscount: 2, bulkMinQty: 3, minOrderQty: 3, deliveryFee: 0 },
    cats: [["همه", "🛒"], ["لبنیات", "🥛"], ["نوشیدنی", "🥤"], ["تنقلات", "🍿"], ["مواد غذایی", "🛍️"], ["بهداشتی", "🧴"]],
    products: [
      { id: "p1", name: "شیر کم‌چرب ۱ لیتری", cat: "لبنیات", price: 38000, stock: 30, emoji: "🥛", images: [] },
      { id: "p2", name: "نوشابه خانواده", cat: "نوشیدنی", price: 65000, stock: 25, emoji: "🥤", images: [] },
      { id: "p3", name: "چیپس نمکی", cat: "تنقلات", price: 45000, stock: 40, emoji: "🍟", images: [] },
      { id: "p4", name: "شکلات پذیرایی", cat: "تنقلات", price: 85000, stock: 20, emoji: "🍫", images: [] },
      { id: "p5", name: "برنج ایرانی ۱۰ کیلویی", cat: "مواد غذایی", price: 980000, stock: 12, emoji: "🍚", images: [] },
      { id: "p6", name: "مایع دستشویی", cat: "بهداشتی", price: 78000, stock: 18, emoji: "🧴", images: [] }
    ],
    customers: [],
    orders: []
  };
}
async function getState(env) {
  const row = await env.DB.prepare("SELECT state_json FROM app_state WHERE id = 1").first();
  if (row?.state_json) {
    try { return JSON.parse(row.state_json); } catch {}
  }
  const state = defaultState();
  await env.DB.prepare("INSERT OR IGNORE INTO app_state (id, state_json) VALUES (1, ?)").bind(JSON.stringify(state)).run();
  return state;
}
async function handleApi(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });

  if (url.pathname === "/api/health" && request.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      return json({ ok: true, service: "jamali-market-api", database: "connected" });
    } catch (error) {
      return json({ ok: false, error: "database_unavailable" }, 503);
    }
  }

  if (url.pathname === "/api/state" && request.method === "GET") {
    try {
      const state = await getState(env);
      return json({ ok: true, state: { settings: state.settings, cats: state.cats, products: state.products } });
    } catch (error) {
      return json({ ok: false, error: "state_read_failed" }, 500);
    }
  }

  if (url.pathname === "/api/admin/state" && request.method === "GET") {
    const session = await requireAdmin(request, env);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    try {
      return json({ ok: true, state: await getState(env) });
    } catch (error) {
      return json({ ok: false, error: "state_read_failed" }, 500);
    }
  }

  if (url.pathname === "/api/admin/bootstrap" && request.method === "POST") {
    try {
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM admins").first();
      if (Number(count?.n || 0) > 0) return json({ ok: false, error: "already_initialized" }, 409);
      const body = await request.json();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (username.length < 3 || password.length < 10) return json({ ok: false, error: "username_min_3_password_min_10" }, 400);
      const encoded = await passwordHash(password);
      await env.DB.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").bind(username, encoded.salt + ":" + encoded.hash).run();
      return json({ ok: true, message: "admin_initialized" }, 201);
    } catch (error) {
      return json({ ok: false, error: "bootstrap_failed" }, 500);
    }
  }

  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    try {
      const body = await request.json();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const admin = await env.DB.prepare("SELECT id, password_hash FROM admins WHERE username = ?").bind(username).first();
      if (!admin) return json({ ok: false, error: "invalid_credentials" }, 401);
      const [salt, storedHash] = String(admin.password_hash).split(":");
      const computed = await passwordHash(password, salt);
      if (computed.hash !== storedHash) return json({ ok: false, error: "invalid_credentials" }, 401);
      const token = randomToken();
      const tokenHash = await sha256(token);
      await env.DB.prepare("INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))").bind(tokenHash, admin.id).run();
      return json({ ok: true, token, expiresIn: 604800 });
    } catch (error) {
      return json({ ok: false, error: "login_failed" }, 500);
    }
  }

  if (url.pathname === "/api/orders" && request.method === "POST") {
    try {
      const body = await request.json();
      const { name, phone, address, date, time, note = "", paymentMethod = "cash", items = [], checkDate = "", checkImage = "" } = body;
      if (!name || !/^09\\d{9}$/.test(String(phone || "")) || !address || !date || !time || !Array.isArray(items) || !items.length) return json({ ok: false, error: "invalid_order_details" }, 400);
      if (paymentMethod === "online") return json({ ok: false, error: "online_payment_not_configured" }, 409);
      if (!["cash", "check", "installment"].includes(paymentMethod)) return json({ ok: false, error: "invalid_payment_method" }, 400);
      if (paymentMethod === "check" && (!checkDate || !checkImage)) return json({ ok: false, error: "check_details_required" }, 400);
      const state = await getState(env);
      const normalized = [];
      let subtotal = 0, qtyTotal = 0;
      for (const item of items) {
        const product = state.products.find(p => p.id === String(item.id));
        const qty = Math.floor(Number(item.qty));
        if (!product || !Number.isFinite(qty) || qty < 1 || qty > Number(product.stock || 0)) return json({ ok: false, error: "stock_changed", productId: item.id }, 409);
        normalized.push({ id: product.id, name: product.name, price: Number(product.price), qty, image: product.images?.[0] || "" });
        subtotal += Number(product.price) * qty;
        qtyTotal += qty;
      }
      if (qtyTotal < Number(state.settings.minOrderQty || 3)) return json({ ok: false, error: "minimum_order_quantity" }, 400);
      const bulk = qtyTotal >= Number(state.settings.bulkMinQty || 3) ? Math.round(subtotal * Number(state.settings.bulkDiscount || 0) / 100) : 0;
      const cashDiscount = paymentMethod === "cash" ? Math.round((subtotal - bulk) * Number(state.settings.cashDiscount || 0) / 100) : 0;
      const total = Math.round(subtotal - bulk - cashDiscount + Number(state.settings.deliveryFee || 0));
      let customer = state.customers.find(x => x.phone === phone);
      if (paymentMethod === "installment" && !customer?.installment) return json({ ok: false, error: "installment_not_authorized" }, 403);
      if (!customer) { customer = { id: "c" + Date.now(), name, phone, address, installment: false }; state.customers.push(customer); }
      else { customer.name = name; customer.address = address; }
      for (const item of normalized) state.products.find(p => p.id === item.id).stock -= item.qty;
      const order = { id: "JM-" + crypto.randomUUID().slice(0, 8).toUpperCase(), name, phone, address, date, time, note, pay: paymentMethod, items: normalized, subtotal, bulk, cash: cashDiscount, delivery: Number(state.settings.deliveryFee || 0), total, status: "در انتظار بررسی", created: new Date().toISOString(), checkDate, checkImage, customerId: customer.id };
      state.orders.push(order);
      await env.DB.prepare("INSERT INTO app_state (id, state_json, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP").bind(JSON.stringify(state)).run();
      return json({ ok: true, order: { id: order.id, total: order.total, status: order.status } }, 201);
    } catch (error) {
      return json({ ok: false, error: "order_creation_failed" }, 500);
    }
  }

  if (url.pathname === "/api/admin/credentials" && request.method === "PUT") {
    const session = await requireAdmin(request, env);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    try {
      const body = await request.json();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (username.length < 3 || password.length < 10) return json({ ok: false, error: "username_min_3_password_min_10" }, 400);
      const encoded = await passwordHash(password);
      await env.DB.prepare("UPDATE admins SET username = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(username, encoded.salt + ":" + encoded.hash, session.admin_id).run();
      return json({ ok: true });
    } catch (error) {
      return json({ ok: false, error: "credentials_update_failed" }, 500);
    }
  }

  if (url.pathname === "/api/admin/logout" && request.method === "POST") {
    const session = await requireAdmin(request, env);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    const token = (request.headers.get("authorization") || "").slice(7);
    await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true });
  }

  if (url.pathname === "/api/state" && request.method === "PUT") {
    const session = await requireAdmin(request, env);
    if (!session) return json({ ok: false, error: "unauthorized" }, 401);
    try {
      const body = await request.json();
      const state = body.state;
      if (!state || !Array.isArray(state.products) || !Array.isArray(state.cats) || !Array.isArray(state.orders) || !Array.isArray(state.customers) || !state.settings) {
        return json({ ok: false, error: "invalid_state" }, 400);
      }
      if (JSON.stringify(state).length > 3500000) return json({ ok: false, error: "state_too_large" }, 413);
      await env.DB.prepare("INSERT INTO app_state (id, state_json, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP").bind(JSON.stringify(state)).run();
      return json({ ok: true, saved: true });
    } catch (error) {
      return json({ ok: false, error: "state_write_failed" }, 500);
    }
  }

  return json({ ok: false, error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Jamali Market API is running. Configure the static assets binding to serve the storefront.", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
};
