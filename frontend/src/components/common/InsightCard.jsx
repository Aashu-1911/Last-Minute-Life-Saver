const icons = { warning: '⚠️', success: '✅', info: '🧠', validation: '🔍' };

const borders = {
  warning: 'border-red-200 bg-red-50',
  success: 'border-green-200 bg-green-50',
  info: 'border-indigo-200 bg-indigo-50',
  validation: 'border-yellow-200 bg-yellow-50',
};

export default function InsightCard({ title, value, description, type = 'info' }) {
  return (
    <div className={`rounded-lg border p-4 ${borders[type] || borders.info}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg shrink-0">{icons[type] || icons.info}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-base font-bold text-gray-900 mt-0.5 truncate">{value}</p>
          {description && <p className="text-sm text-gray-600 mt-1">{description}</p>}
        </div>
      </div>
    </div>
  );
}
