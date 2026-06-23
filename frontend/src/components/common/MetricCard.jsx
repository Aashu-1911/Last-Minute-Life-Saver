export default function MetricCard({ label, value, sub, color = 'indigo', loading = false }) {
  const colors = {
    indigo: 'border-indigo-200 bg-indigo-50',
    green: 'border-green-200 bg-green-50',
    red: 'border-red-200 bg-red-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    gray: 'border-gray-200 bg-gray-50',
  };

  const textColors = {
    indigo: 'text-indigo-700',
    green: 'text-green-700',
    red: 'text-red-700',
    yellow: 'text-yellow-700',
    gray: 'text-gray-700',
  };

  return (
    <div className={`rounded-lg border p-4 ${colors[color] || colors.gray}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      {loading ? (
        <div className="h-8 w-16 bg-gray-200 animate-pulse rounded mt-1" />
      ) : (
        <p className={`text-3xl font-bold mt-1 ${textColors[color] || textColors.gray}`}>{value}</p>
      )}
      {sub && !loading && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
