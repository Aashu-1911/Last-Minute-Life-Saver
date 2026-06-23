import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TaskProvider } from './context/TaskContext';
import Navbar from './components/layout/Navbar';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';

export default function App() {
  return (
    <BrowserRouter>
      <TaskProvider>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/schedule" element={<Schedule />} />
          </Routes>
        </div>
      </TaskProvider>
    </BrowserRouter>
  );
}
