// Orders whose card check timed out wait here, to be charged again later.
import { saveOrder } from './orders.js';

export function queueRetry(order, card) {
  order.status = 'pending';
  // Saved now, so the customer sees the order straight away.
  return saveOrder(order);
}
