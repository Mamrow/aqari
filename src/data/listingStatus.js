export const STATUS_LABEL_KEYS = {
  pending: 'statusPending',
  approved: 'statusApproved',
  rejected: 'statusRejected',
};

// Pending gets its own slate blue — distinct from the app's green accent,
// the red used for rejected/danger, AND from FEATURED_GOLD (an amber this
// close to gold read as the same color on a small status banner).
const PENDING_COLOR = '#4A6FA5';

export function getStatusColor(status, colors) {
  if (status === 'approved') return colors.accent;
  if (status === 'rejected') return colors.danger;
  return PENDING_COLOR;
}
