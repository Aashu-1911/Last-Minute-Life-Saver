export default function PageContainer({ children }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {children}
    </div>
  );
}
