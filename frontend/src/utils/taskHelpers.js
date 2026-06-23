export const getPriorityLabel = (score) => {
  if (score >= 90) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
};

export const getPriorityColor = (score) => {
  if (score >= 90) return 'bg-red-100 text-red-700';
  if (score >= 70) return 'bg-orange-100 text-orange-700';
  if (score >= 40) return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-600';
};

export const getStatusLabel = (status) => {
  switch (status) {
    case 'SCHEDULED': return 'Scheduled';
    case 'REVIEW_REQUIRED': return 'Review Required';
    case 'OVERDUE_RISK': return 'Deadline Risk';
    case 'UNSCHEDULED': return 'Unscheduled';
    case 'INVALID_ESTIMATE': return 'Invalid Estimate';
    default: return status || 'Unknown';
  }
};

export const getStatusColor = (status) => {
  switch (status) {
    case 'SCHEDULED': return 'bg-green-100 text-green-700';
    case 'REVIEW_REQUIRED': return 'bg-yellow-100 text-yellow-700';
    case 'OVERDUE_RISK': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-500';
  }
};

export const daysUntilDeadline = (deadlineStr) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(deadlineStr);
  deadline.setHours(0, 0, 0, 0);
  return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
};
