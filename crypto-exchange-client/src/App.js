import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SignUp from './components/SignUp';
import Login from './components/Login';
import VerifyIdentity from './components/VerifyIdentity';
import DocumentUpload from './components/DocumentUpload';
import Dashboard from './components/Dashboard';
import About from './components/About';
import Terms from './components/Terms';
import Privacy from './components/Privacy';
import Support from './components/Support';
import AdminPanel from './components/AdminPanel';
import VerificationQueue from './components/VerificationQueue';
import './App.css';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('auth_token');

  if (!token)
    return <Navigate to="/login" replace />;

  return children;
};

const AuthRoutes = ({ children }) => {
  const token = localStorage.getItem('auth_token');

  if (token)
    return <Navigate to="/dashboard" replace />;

  return children;
}

const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('auth_token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/signup" element={<AuthRoutes><SignUp /></AuthRoutes>} />
        <Route path="/login" element={<AuthRoutes><Login /></AuthRoutes>} />
        <Route path="/verify" element={<ProtectedRoute><VerifyIdentity /></ProtectedRoute>} />
        <Route path="/document-upload" element={<ProtectedRoute><DocumentUpload /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

        {/* Admin routes */}
        <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
        <Route path="/admin/queue" element={<AdminRoute><VerificationQueue /></AdminRoute>} />

        <Route path="/about" element={<About />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/support" element={<Support />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;