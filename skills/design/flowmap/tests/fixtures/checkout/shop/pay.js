// Charges the card through the card network.
import { cardNetwork } from './network.js';
import { saveOrder } from './orders.js';
import { queueRetry } from './retry.js';
import { showDeclined } from './pages.js';

export async function charge(order, card) {
  let result;
  try {
    result = await cardNetwork.authorize(card, order.total);
  } catch (timeout) {
    // The card network did not answer. Try again later instead of failing the order.
    return queueRetry(order, card);
  }
  if (result.accepted) {
    order.status = 'paid';
    return saveOrder(order);
  }
  order.status = 'declined';
  return showDeclined(order);
}
