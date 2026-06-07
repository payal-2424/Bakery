import PDFDocument from 'pdfkit';
import { query, withTransaction } from '../config/database.js';
import * as R from '../utils/response.js';

// ─── GET /api/billing/invoices ────────────────────────────────────────────────
export async function getInvoices(req, res) {
  const { tenantId } = req.user;
  const { page = 1, limit = 20, from, to, search } = req.query;
  const { offset, limit: lim } = R.paginate(page, limit);

  const conditions = ['i.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (from)    { conditions.push(`i.invoice_date >= $${idx++}`); params.push(from); }
  if (to)      { conditions.push(`i.invoice_date <= $${idx++}`); params.push(to);   }
  if (search)  {
    conditions.push(`(i.invoice_number ILIKE $${idx} OR i.customer_name ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.join(' AND ');

  const [invRes, countRes] = await Promise.all([
    query(
      `SELECT i.* FROM invoices i WHERE ${where}
       ORDER BY i.invoice_date DESC, i.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, lim, offset]
    ),
    query(`SELECT COUNT(*) FROM invoices i WHERE ${where}`, params),
  ]);

  return R.paginatedResponse(res, invRes.rows, parseInt(countRes.rows[0].count), page, lim);
}

// ─── POST /api/billing/invoices ───────────────────────────────────────────────
export async function createInvoice(req, res) {
  const { tenantId, id: userId } = req.user;
  const {
    orderId, customerId, customerName, customerPhone,
    customerGstin, customerAddress,
    items, discount = 0, cgstRate = 2.5, sgstRate = 2.5,
    notes, invoiceDate,
  } = req.body;

  const result = await withTransaction(async (client) => {
    // Get invoice number
    const numRes = await client.query(
      'SELECT generate_invoice_number($1) as num', [tenantId]
    );
    const invoiceNumber = numRes.rows[0].num;

    // Calculate totals
    const subtotal   = items.reduce((s, i) => s + (i.unitPrice * i.qty - (i.discount || 0)), 0);
    const cgstAmount = parseFloat(((subtotal - discount) * cgstRate / 100).toFixed(2));
    const sgstAmount = parseFloat(((subtotal - discount) * sgstRate / 100).toFixed(2));
    const total      = subtotal - discount + cgstAmount + sgstAmount;

    const invRes = await client.query(
      `INSERT INTO invoices(
        tenant_id, invoice_number, order_id, customer_id,
        customer_name, customer_phone, customer_gstin, customer_address,
        subtotal, cgst_rate, sgst_rate, cgst_amount, sgst_amount,
        discount, total_amount, invoice_date, notes
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        tenantId, invoiceNumber, orderId || null, customerId || null,
        customerName, customerPhone, customerGstin || null, customerAddress || null,
        subtotal, cgstRate, sgstRate, cgstAmount, sgstAmount,
        discount, total, invoiceDate || 'today', notes || null,
      ]
    );

    const invoice = invRes.rows[0];

    for (const item of items) {
      const taxAmt = parseFloat((item.unitPrice * item.qty * (item.taxRate || 5) / 100).toFixed(2));
      await client.query(
        `INSERT INTO invoice_items(invoice_id, item_name, hsn_code, qty, unit_price, discount, tax_rate, tax_amount, total_price)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          invoice.id, item.itemName, item.hsnCode || '2106',
          item.qty, item.unitPrice, item.discount || 0,
          item.taxRate || 5, taxAmt,
          item.unitPrice * item.qty - (item.discount || 0),
        ]
      );
    }

    return invoice;
  });

  return R.created(res, result);
}

// ─── GET /api/billing/invoices/:id/pdf ────────────────────────────────────────
export async function downloadInvoicePDF(req, res) {
  const { tenantId } = req.user;
  const { id } = req.params;

  const [invRes, itemsRes, tenantRes] = await Promise.all([
    query('SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2', [id, tenantId]),
    query('SELECT * FROM invoice_items WHERE invoice_id=$1', [id]),
    query('SELECT * FROM tenants WHERE id=$1', [tenantId]),
  ]);

  if (!invRes.rows[0]) return R.notFound(res, 'Invoice not found');

  const inv    = invRes.rows[0];
  const items  = itemsRes.rows;
  const tenant = tenantRes.rows[0];

  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${inv.invoice_number}.pdf"`);
  doc.pipe(res);

  // ── Header ────────────────────────────────────────────────
  doc.fontSize(22).font('Helvetica-Bold').text(tenant.name, 50, 50);
  doc.fontSize(10).font('Helvetica')
     .text(tenant.address || '', 50, 80)
     .text(`${tenant.city || ''}, ${tenant.state || ''}`, 50, 95)
     .text(`GSTIN: ${tenant.gstin || 'N/A'}`, 50, 110)
     .text(`Phone: ${tenant.phone || ''}`, 50, 125);

  doc.fontSize(18).font('Helvetica-Bold').text('TAX INVOICE', 400, 50, { align: 'right' });
  doc.fontSize(10).font('Helvetica')
     .text(`Invoice No: ${inv.invoice_number}`, 400, 80, { align: 'right' })
     .text(`Date: ${new Date(inv.invoice_date).toLocaleDateString('en-IN')}`, 400, 95, { align: 'right' });

  // Horizontal line
  doc.moveTo(50, 150).lineTo(545, 150).stroke();

  // ── Bill To ───────────────────────────────────────────────
  doc.fontSize(11).font('Helvetica-Bold').text('Bill To:', 50, 165);
  doc.fontSize(10).font('Helvetica')
     .text(inv.customer_name || 'Customer', 50, 180)
     .text(inv.customer_phone || '', 50, 195)
     .text(inv.customer_address || '', 50, 210)
     .text(inv.customer_gstin ? `GSTIN: ${inv.customer_gstin}` : '', 50, 225);

  doc.moveTo(50, 250).lineTo(545, 250).stroke();

  // ── Items table ───────────────────────────────────────────
  const tableTop = 265;
  const cols     = { sr: 50, item: 80, hsn: 240, qty: 290, rate: 340, tax: 400, total: 480 };

  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('#',         cols.sr,   tableTop);
  doc.text('Item',      cols.item, tableTop);
  doc.text('HSN',       cols.hsn,  tableTop);
  doc.text('Qty',       cols.qty,  tableTop);
  doc.text('Rate',      cols.rate, tableTop);
  doc.text('Tax',       cols.tax,  tableTop);
  doc.text('Total',     cols.total,tableTop);

  doc.moveTo(50, tableTop + 18).lineTo(545, tableTop + 18).stroke();

  let y = tableTop + 28;
  doc.font('Helvetica').fontSize(9);
  items.forEach((item, i) => {
    doc.text(String(i + 1),            cols.sr,   y);
    doc.text(item.item_name,           cols.item, y, { width: 150 });
    doc.text(item.hsn_code || '',      cols.hsn,  y);
    doc.text(String(item.qty),         cols.qty,  y);
    doc.text(`₹${item.unit_price}`,    cols.rate, y);
    doc.text(`${item.tax_rate}%`,      cols.tax,  y);
    doc.text(`₹${item.total_price}`,   cols.total,y);
    y += 22;
  });

  // ── Totals ────────────────────────────────────────────────
  doc.moveTo(350, y + 5).lineTo(545, y + 5).stroke();
  y += 15;
  doc.font('Helvetica').fontSize(10);
  const addRow = (label, value) => {
    doc.text(label, 350, y).text(`₹${value}`, 480, y); y += 18;
  };
  addRow('Subtotal:',          parseFloat(inv.subtotal).toFixed(2));
  if (inv.discount > 0) addRow('Discount:',  `-${parseFloat(inv.discount).toFixed(2)}`);
  addRow(`CGST @${inv.cgst_rate}%:`, parseFloat(inv.cgst_amount).toFixed(2));
  addRow(`SGST @${inv.sgst_rate}%:`, parseFloat(inv.sgst_amount).toFixed(2));

  doc.moveTo(350, y).lineTo(545, y).stroke();
  y += 5;
  doc.font('Helvetica-Bold').fontSize(11)
     .text('TOTAL:', 350, y)
     .text(`₹${parseFloat(inv.total_amount).toFixed(2)}`, 480, y);

  // ── Footer ────────────────────────────────────────────────
  doc.fontSize(9).font('Helvetica').text(
    'Thank you for your business!',
    50, 720, { align: 'center', width: 495 }
  );

  doc.end();
}

// ─── DELETE /api/billing/invoices/:id ─────────────────────────────────────────
export async function deleteInvoice(req, res) {
  const { tenantId } = req.user;
  const { id } = req.params;
  const { rows } = await query(
    'DELETE FROM invoices WHERE id=$1 AND tenant_id=$2 RETURNING id',
    [id, tenantId]
  );
  if (!rows[0]) return R.notFound(res, 'Invoice not found');
  return R.ok(res, { id: rows[0].id });
}
