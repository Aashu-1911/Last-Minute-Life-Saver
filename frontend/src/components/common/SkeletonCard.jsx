export default function SkeletonCard({ lines = 3 }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/3 mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`h-2.5 bg-gray-200 rounded mb-2 ${i === lines - 1 ? 'w-1/2' : 'w-full'}`} />
      ))}
    </div>
  );
}
