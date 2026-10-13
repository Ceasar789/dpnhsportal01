const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase();

const compareText = (left, right) => {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);

  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
};

const relevanceRank = (user, query) => {
  const name = normalize(user.name);
  const email = normalize(user.email);

  if (name.startsWith(query)) return 0;
  if (name.includes(query)) return 1;
  if (email.includes(query)) return 2;
  return Number.POSITIVE_INFINITY;
};

export function filterAndRankUsers({
  users,
  query,
  roleFilter,
  statusFilter,
  showArchived,
  onlineUserIds,
}) {
  const normalizedQuery = normalize(query);
  const visibleUsers = users.filter((user) => {
    const status = normalize(user.status || 'active');
    const archivedMatch = showArchived ? status === 'archived' : status !== 'archived';
    const roleMatch = !roleFilter || roleFilter === 'All Roles' || user.role === roleFilter;
    const onlineMatch = onlineUserIds.has(user.id);
    const normalizedStatusFilter = normalize(statusFilter);
    const statusMatch = !normalizedStatusFilter || normalizedStatusFilter === 'all status'
      || (normalizedStatusFilter === 'online' && onlineMatch)
      || (normalizedStatusFilter === 'offline' && !onlineMatch);

    if (!archivedMatch || !roleMatch || !statusMatch) return false;
    if (!normalizedQuery) return true;

    return relevanceRank(user, normalizedQuery) !== Number.POSITIVE_INFINITY;
  });

  if (!normalizedQuery) return visibleUsers;

  return visibleUsers.sort((left, right) => (
    relevanceRank(left, normalizedQuery) - relevanceRank(right, normalizedQuery)
    || compareText(left.name, right.name)
    || compareText(left.email, right.email)
    || compareText(left.id, right.id)
  ));
}
