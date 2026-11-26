// Stores orders, and mails a receipt for each one that was not declined.
import { db } from './db.js';
import { sendReceipt } from './receipt.js';

export async function saveOrder(order) {
  await db.orders.upsert(order);
  if (order.status !== 'declined') await sendReceipt(order);
  return order;
}
