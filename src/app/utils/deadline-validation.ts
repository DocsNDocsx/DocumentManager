export function minimumProjectDeadline(now = new Date()): string {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidProjectDeadline(deadline: string, now = new Date()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline >= minimumProjectDeadline(now);
}
