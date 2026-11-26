// Emails the receipt for an order.
import { mailer } from './mailer.js';

export async function sendReceipt(order) {
  await mailer.send(order.email, 'receipt', { order });
}
