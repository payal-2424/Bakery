import axios from 'axios';
import crypto from 'crypto';
import { query, withTransaction } from '../config/database.js';
import * as R from '../utils/response.js';
import logger from '../utils/logger.js';

// ─── GET /api/whatsapp/webhook (Meta verification) ────────────────────────────
export async function verifyWebhook(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Find tenant by verify token
  const { rows } = await query(
    'SELECT tenant_id FROM whatsapp_config WHERE webhook_verify_token = $1 AND is_active = TRUE',
    [token]
  );

  if (mode === 'subscribe' && rows[0]) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
}

// ─── POST /api/whatsapp/webhook (incoming messages) ───────────────────────────
export async function receiveWebhook(req, res) {
  // Verify Meta signature
  const signature = req.headers['x-hub-signature-256'];
  if (!verifyMetaSignature(req.rawBody, signature)) {
    return res.status(401).send('Invalid signature');
  }

  res.status(200).send('EVENT_RECEIVED'); // Respond fast to Meta

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const { metadata, messages, contacts } = change.value;
        if (!messages?.length) continue;

        // Find tenant by phone number ID
        const { rows: configRows } = await query(
          'SELECT tenant_id, access_token FROM whatsapp_config WHERE phone_number_id = $1 AND is_active = TRUE',
          [metadata.phone_number_id]
        );

        if (!configRows[0]) {
          logger.warn('WA webhook: no tenant for phone_number_id', { id: metadata.phone_number_id });
          continue;
        }

        const { tenant_id: tenantId, access_token: accessToken } = configRows[0];

        for (const message of messages) {
          await processIncomingMessage(tenantId, message, contacts?.[0], accessToken, metadata.phone_number_id);
        }
      }
    }
  } catch (err) {
    logger.error('WA webhook processing error', { error: err.message });
  }
}

// ─── Bot state machine ────────────────────────────────────────────────────────
async function processIncomingMessage(tenantId, message, contact, accessToken, phoneNumberId) {
  const fromPhone = message.from;
  const msgType   = message.type;

  // Save incoming message
  await query(
    `INSERT INTO whatsapp_messages(tenant_id, wa_message_id, direction, from_number, message_type, content)
     VALUES($1,$2,'inbound',$3,$4,$5)
     ON CONFLICT DO NOTHING`,
    [tenantId, message.id, fromPhone, msgType, JSON.stringify(message)]
  );

  // Get or create session
  const sessionRes = await query(
    `INSERT INTO whatsapp_sessions(tenant_id, phone, step, data)
     VALUES($1,$2,'idle','{}')
     ON CONFLICT(phone, tenant_id) DO UPDATE
       SET expires_at = NOW() + INTERVAL '30 minutes'
     RETURNING *`,
    [tenantId, fromPhone]
  );
  let session = sessionRes.rows[0];

  // If session expired, reset to idle
  if (new Date() > new Date(session.expires_at)) {
    await query(
      "UPDATE whatsapp_sessions SET step='idle', data='{}' WHERE id=$1",
      [session.id]
    );
    session.step = 'idle';
    session.data = {};
  }

  // Extract text input
  let userText = '';
  if (msgType === 'text') {
    userText = message.text.body.trim().toLowerCase();
  } else if (msgType === 'interactive') {
    if (message.interactive.type === 'button_reply') {
      userText = message.interactive.button_reply.id;
    } else if (message.interactive.type === 'list_reply') {
      userText = message.interactive.list_reply.id;
    }
  }

  // Get tenant inventory for menu
  const { rows: products } = await query(
    'SELECT id, name, sell_price, unit FROM inventory_items WHERE tenant_id=$1 AND is_active=TRUE ORDER BY name LIMIT 10',
    [tenantId]
  );

  // State machine
  const { step, data } = session;
  let replyMessage = null;
  let nextStep = step;
  let newData = { ...data };

  if (step === 'idle' || ['hi','hello','hii','hey','namaste','start','menu'].some(w => userText.includes(w))) {
    nextStep = 'main_menu';
    replyMessage = buildMainMenuMessage(contact?.profile?.name);
  } else if (step === 'main_menu') {
    if (userText === 'order') {
      nextStep = 'select_product';
      replyMessage = buildProductListMessage(products);
    } else if (userText === 'status') {
      nextStep = 'ask_order_number';
      replyMessage = { type: 'text', body: '📋 Please enter your order number (e.g. ORD-20250101-0001):' };
    } else if (userText === 'contact') {
      const { rows: t } = await query('SELECT name, phone, city FROM tenants WHERE id=$1', [tenantId]);
      replyMessage = { type: 'text', body: `📞 *${t[0].name}*\n📍 ${t[0].city}\n📱 ${t[0].phone}\n\nOpen: 7am – 9pm` };
      nextStep = 'idle';
    } else {
      replyMessage = buildMainMenuMessage(contact?.profile?.name);
    }
  } else if (step === 'select_product') {
    const product = products.find(p => p.id === userText || p.name.toLowerCase().includes(userText));
    if (product) {
      newData.product = { id: product.id, name: product.name, price: product.sell_price };
      nextStep = 'select_qty';
      replyMessage = buildQtyMessage(product.name, product.sell_price);
    } else {
      replyMessage = { type: 'text', body: '❌ Invalid selection. Please choose from the menu.' };
    }
  } else if (step === 'select_qty') {
    const qty = parseInt(userText);
    if (!isNaN(qty) && qty > 0 && qty <= 50) {
      newData.qty = qty;
      nextStep = 'ask_name';
      replyMessage = { type: 'text', body: '👤 Please enter your *name*:' };
    } else {
      replyMessage = { type: 'text', body: '❌ Please enter a valid quantity (1-50).' };
    }
  } else if (step === 'ask_name') {
    newData.customerName = message.type === 'text' ? message.text.body.trim() : userText;
    nextStep = 'ask_pickup';
    replyMessage = buildPickupMessage();
  } else if (step === 'ask_pickup') {
    if (['today','tomorrow','day_after'].includes(userText)) {
      const dateMap = { today: 0, tomorrow: 1, day_after: 2 };
      const pickupDate = new Date();
      pickupDate.setDate(pickupDate.getDate() + dateMap[userText]);
      newData.pickupDate = pickupDate.toISOString().split('T')[0];
      newData.pickupLabel = userText.replace('_', ' ');
      nextStep = 'confirm_order';
      replyMessage = buildConfirmMessage(newData);
    } else {
      replyMessage = { type: 'text', body: '❌ Please choose a pickup date from the options.' };
    }
  } else if (step === 'confirm_order') {
    if (userText === 'confirm') {
      // Create order in DB
      const total = newData.product.price * newData.qty;
      const numRes = await query('SELECT generate_order_number($1) as num', [tenantId]);
      const orderNumber = numRes.rows[0].num;

      const orderRes = await withTransaction(async (client) => {
        const ord = await client.query(
          `INSERT INTO orders(tenant_id, order_number, customer_name, customer_phone, status, source,
                              delivery_type, pickup_date, subtotal, total_amount, notes)
           VALUES($1,$2,$3,$4,'new','whatsapp','pickup',$5,$6,$6,$7) RETURNING id`,
          [tenantId, orderNumber, newData.customerName, fromPhone,
           newData.pickupDate, total, `WhatsApp order via bot`]
        );
        const orderId = ord.rows[0].id;
        await client.query(
          `INSERT INTO order_items(order_id, tenant_id, item_id, item_name, qty, unit_price, total_price)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [orderId, tenantId, newData.product.id, newData.product.name, newData.qty, newData.product.price, total]
        );

        // Create notification
        await client.query(
          `INSERT INTO notifications(tenant_id, type, title, body, data)
           VALUES($1,'new_order',$2,$3,$4)`,
          [tenantId, `New WhatsApp Order: ${orderNumber}`,
           `${newData.customerName} ordered ${newData.qty}x ${newData.product.name}`,
           JSON.stringify({ orderId, orderNumber })]
        );

        return { orderId, orderNumber };
      });

      replyMessage = {
        type: 'text',
        body: `✅ *Order Confirmed!*\n\n` +
              `🧾 Order ID: *${orderRes.orderNumber}*\n` +
              `🍰 ${newData.product.name} × ${newData.qty}\n` +
              `📅 Pickup: ${newData.pickupLabel}\n` +
              `💰 Total: ₹${total}\n\n` +
              `Thank you, ${newData.customerName}! Your order is being prepared. 🎂`,
      };
      nextStep = 'idle';
      newData  = {};
    } else {
      nextStep = 'idle';
      newData  = {};
      replyMessage = { type: 'text', body: '❌ Order cancelled. Type "Hi" to start a new order.' };
    }
  } else if (step === 'ask_order_number') {
    const { rows: orders } = await query(
      'SELECT order_number, status, total_amount FROM orders WHERE tenant_id=$1 AND order_number ILIKE $2',
      [tenantId, `%${userText.toUpperCase()}%`]
    );
    if (orders[0]) {
      replyMessage = {
        type: 'text',
        body: `📋 *Order Status*\n\n` +
              `Order: ${orders[0].order_number}\n` +
              `Status: ${orders[0].status.toUpperCase()}\n` +
              `Amount: ₹${orders[0].total_amount}`,
      };
    } else {
      replyMessage = { type: 'text', body: '❌ Order not found. Please check the order number.' };
    }
    nextStep = 'idle';
  } else {
    // Fallback
    replyMessage = buildMainMenuMessage(contact?.profile?.name);
    nextStep = 'main_menu';
  }

  // Update session
  await query(
    'UPDATE whatsapp_sessions SET step=$1, data=$2, updated_at=NOW() WHERE id=$3',
    [nextStep, JSON.stringify(newData), session.id]
  );

  // Send reply
  if (replyMessage) {
    await sendWhatsAppMessage(fromPhone, replyMessage, accessToken, phoneNumberId, tenantId);
  }
}

// ─── Message builders ─────────────────────────────────────────────────────────
function buildMainMenuMessage(name) {
  const greeting = name ? `Namaste ${name}! 🙏` : 'Namaste! 🙏';
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `${greeting}\nWelcome to *Sweet Crumbs Bakery* 🍰\n\nHow can I help you today?` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'order',   title: '🛒 Place Order'  } },
          { type: 'reply', reply: { id: 'status',  title: '📋 Order Status' } },
          { type: 'reply', reply: { id: 'contact', title: '📞 Contact Us'   } },
        ],
      },
    },
  };
}

function buildProductListMessage(products) {
  const rows = products.slice(0, 10).map(p => ({
    id:          p.id,
    title:       p.name.substring(0, 24),
    description: `₹${p.sell_price} per ${p.unit}`,
  }));
  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      body:   { text: '🍰 *Our Menu*\nSelect a product to order:' },
      action: { button: 'View Menu', sections: [{ title: 'Products', rows }] },
    },
  };
}

function buildQtyMessage(productName, price) {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `You selected: *${productName}* (₹${price} each)\n\nHow many would you like?` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: '1', title: '1' } },
          { type: 'reply', reply: { id: '2', title: '2' } },
          { type: 'reply', reply: { id: '3', title: '3' } },
        ],
      },
    },
  };
}

function buildPickupMessage() {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: '📅 When would you like to pick up your order?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'today',     title: '📅 Today'     } },
          { type: 'reply', reply: { id: 'tomorrow',  title: '📅 Tomorrow'  } },
          { type: 'reply', reply: { id: 'day_after', title: '📅 Day After' } },
        ],
      },
    },
  };
}

function buildConfirmMessage(data) {
  const total = data.product.price * data.qty;
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `🛍️ *Order Summary*\n\n` +
              `🍰 ${data.product.name} × ${data.qty}\n` +
              `👤 ${data.customerName}\n` +
              `📅 Pickup: ${data.pickupLabel}\n` +
              `💰 Total: ₹${total}\n\nConfirm your order?`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'confirm', title: '✅ Confirm' } },
          { type: 'reply', reply: { id: 'cancel',  title: '❌ Cancel'  } },
        ],
      },
    },
  };
}

// ─── Send WhatsApp message via Meta API ───────────────────────────────────────
async function sendWhatsAppMessage(to, message, accessToken, phoneNumberId, tenantId) {
  try {
    let payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to };

    if (message.type === 'text') {
      payload.type = 'text';
      payload.text = { body: message.body, preview_url: false };
    } else if (message.type === 'interactive') {
      payload.type = 'interactive';
      payload.interactive = message.interactive;
    }

    const res = await axios.post(
      `https://graph.facebook.com/${process.env.WA_API_VERSION}/${phoneNumberId}/messages`,
      payload,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    await query(
      `INSERT INTO whatsapp_messages(tenant_id, wa_message_id, direction, to_number, message_type, content, status)
       VALUES($1,$2,'outbound',$3,$4,$5,'sent')`,
      [tenantId, res.data.messages?.[0]?.id, to, message.type, JSON.stringify(payload)]
    );
  } catch (err) {
    logger.error('WA send error', { error: err.response?.data || err.message });
  }
}

// ─── Verify Meta webhook signature ───────────────────────────────────────────
function verifyMetaSignature(rawBody, signature) {
  if (!signature || !process.env.WA_APP_SECRET) return true; // skip in dev
  const expected = 'sha256=' + crypto.createHmac('sha256', process.env.WA_APP_SECRET)
    .update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ─── GET /api/whatsapp/config ─────────────────────────────────────────────────
export async function getConfig(req, res) {
  const { tenantId } = req.user;
  const { rows } = await query(
    'SELECT id, phone_number_id, business_account_id, is_active, webhook_verify_token FROM whatsapp_config WHERE tenant_id=$1',
    [tenantId]
  );
  return R.ok(res, rows[0] || null);
}

// ─── POST /api/whatsapp/config ────────────────────────────────────────────────
export async function saveConfig(req, res) {
  const { tenantId } = req.user;
  const { phoneNumberId, businessAccountId, accessToken, webhookVerifyToken } = req.body;

  const { rows } = await query(
    `INSERT INTO whatsapp_config(tenant_id, phone_number_id, business_account_id, access_token, webhook_verify_token, is_active)
     VALUES($1,$2,$3,$4,$5,TRUE)
     ON CONFLICT(tenant_id) DO UPDATE SET
       phone_number_id = $2, business_account_id = $3,
       access_token = $4, webhook_verify_token = $5,
       is_active = TRUE, updated_at = NOW()
     RETURNING id, phone_number_id, is_active`,
    [tenantId, phoneNumberId, businessAccountId, accessToken, webhookVerifyToken]
  );

  return R.ok(res, rows[0]);
}

// ─── POST /api/whatsapp/broadcast ─────────────────────────────────────────────
export async function sendBroadcast(req, res) {
  const { tenantId } = req.user;
  const { message, customerIds } = req.body;

  const configRes = await query(
    'SELECT * FROM whatsapp_config WHERE tenant_id=$1 AND is_active=TRUE',
    [tenantId]
  );
  if (!configRes.rows[0]) return R.badRequest(res, 'WhatsApp not configured');

  const { access_token, phone_number_id } = configRes.rows[0];

  const customersRes = await query(
    'SELECT phone, name FROM customers WHERE id = ANY($1) AND tenant_id=$2',
    [customerIds, tenantId]
  );

  let sent = 0;
  for (const customer of customersRes.rows) {
    const personalised = message.replace('{name}', customer.name);
    await sendWhatsAppMessage(
      customer.phone, { type: 'text', body: personalised },
      access_token, phone_number_id, tenantId
    );
    sent++;
    await new Promise(r => setTimeout(r, 300)); // Rate limiting
  }

  return R.ok(res, { sent }, `Broadcast sent to ${sent} customers`);
}
