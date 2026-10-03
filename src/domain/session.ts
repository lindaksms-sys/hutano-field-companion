/**
 * In-memory current-account state used by the data layer for partitioning and
 * to stop in-flight sync responses from touching another account's state.
 * `epoch` increments on every account change (sign-in, sign-out, switch).
 */
let currentUserId: string | null = null;
let epoch = 0;
const listeners = new Set<() => void>();

export function setCurrentUser(id: string | null) {
  if (id === currentUserId) return;
  currentUserId = id;
  epoch += 1;
  listeners.forEach((l) => l());
}
export const getCurrentUserId = () => currentUserId;
export const getEpoch = () => epoch;
export function onUserChange(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
