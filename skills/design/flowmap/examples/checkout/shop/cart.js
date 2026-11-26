// A made-up shop for the flowmap example. It is never run.
import { charge } from './pay.js';

export async function onPayPressed(cart, card) {
  const order = { id: cart.id, email: cart.email, items: cart.items, total: cart.total, status: 'new' };
  return charge(order, card);
}
