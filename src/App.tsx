import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tickets from './pages/Tickets';
import Customers from './pages/Customers';
import Reports from './pages/Reports';
import Users from './pages/Users';
import ApiDocs from './pages/ApiDocs';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes using Layout */}
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<Users />} />
          <Route path="/analytics" element={<Navigate to="/reports" replace />} />
          <Route path="/api-docs" element={<ApiDocs />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
