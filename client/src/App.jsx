import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import AssetDetail from './pages/AssetDetail.jsx';
import Alerts from './pages/Alerts.jsx';
import Analytics from './pages/Analytics.jsx';

const linkClass = ({ isActive }) => (isActive ? 'active' : undefined);

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">◆ FleetView</span>
        <nav>
          <NavLink to="/" end className={linkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/alerts" className={linkClass}>
            Alerts &amp; Tickets
          </NavLink>
          <NavLink to="/analytics" className={linkClass}>
            Analytics
          </NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/assets/:id" element={<AssetDetail />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </div>
  );
}
