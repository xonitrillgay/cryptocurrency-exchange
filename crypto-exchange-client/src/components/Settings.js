import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Settings.css';

function Settings() {
    const navigate = useNavigate();
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isPasswordResetRequested, setIsPasswordResetRequested] = useState(false);
    const [email, setEmail] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    // Enhanced function to get proper display name from user data - matching Dashboard.js
    const getDisplayName = (user) => {
        if (!user) return "Guest";

        // Check if we have user_verification data with first_name and last_name
        if (user.verification && user.verification.first_name && user.verification.last_name) {
            return `${user.verification.first_name} ${user.verification.last_name}`;
        }

        // Check if first_name and last_name are directly on the user object
        if (user.first_name && user.last_name) {
            return `${user.first_name} ${user.last_name}`;
        }

        // Use display_name if available
        if (user.display_name) {
            return user.display_name;
        }

        // Use username if available
        if (user.username) {
            return user.username;
        }

        // Use email without domain as fallback
        if (user.email) {
            return user.email.split('@')[0];
        }

        // If we have an ID but nothing else, just use a friendly format
        return `User ${user.id ? '#' + user.id : ''}`;
    };

    // Navigate to admin panel if user is admin
    const navigateToAdminPanel = () => {
        navigate('/admin');
    };

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const token = localStorage.getItem('auth_token');

                if (!token) {
                    navigate('/login');
                    return;
                }

                // First try to parse the token to get basic user info (fallback method)
                try {
                    // JWT tokens are in format: header.payload.signature
                    const tokenParts = token.split('.');
                    if (tokenParts.length === 3) {
                        const payload = JSON.parse(atob(tokenParts[1])); // Decode base64
                        // Extract user info from token if available
                        const fallbackUserData = {
                            email: payload.email || payload.sub || "User",
                            user_id: payload.user_id || payload.sub,
                            first_name: payload.first_name || "",
                            last_name: payload.last_name || "",
                            username: payload.username || "",
                        };
                        setUserData(fallbackUserData);
                        setEmail(fallbackUserData.email);
                    }
                } catch (tokenError) {
                    console.warn("Could not parse token for fallback user data:", tokenError);
                }

                // Try fetching user data from API
                try {
                    const userResponse = await fetch('http://localhost:8080/user/profile', {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    });

                    if (userResponse.ok) {
                        const userDataResponse = await userResponse.json();
                        const apiUserData = userDataResponse.user || userDataResponse;
                        setUserData(apiUserData);
                        setEmail(apiUserData.email || '');

                        // Check and set admin status
                        if (apiUserData && apiUserData.is_admin) {
                            setIsAdmin(true);
                        }
                    } else {
                        const errorData = await userResponse.json();
                        setApiError(errorData.error || 'Failed to fetch user data');

                        if (userResponse.status === 401) {
                            localStorage.removeItem('auth_token');
                            navigate('/login');
                        }
                    }
                } catch (userApiError) {
                    console.warn("API error when fetching user data:", userApiError);
                    // Continue with fallback data
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
                setApiError('Server connection error. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserData();
    }, [navigate]);

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        setApiError('');
        setSuccessMessage('');

        try {
            const response = await fetch('http://localhost:8080/user/request-password-reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            if (response.ok) {
                setIsPasswordResetRequested(true);
                setSuccessMessage('Password reset link has been sent to your email address.');
            } else {
                const errorData = await response.json();
                setApiError(errorData.error || 'Failed to request password reset.');
            }
        } catch (error) {
            console.error('Error requesting password reset:', error);
            setApiError('Server connection error. Please try again later.');
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    if (isLoading) {
        return <div className="loading-container">Loading your settings...</div>;
    }

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="logo">CryptoX</div>
                <div className="header-actions">
                    <div className="search-container">
                        <input type="text" placeholder="Search..." className="search-input" />
                    </div>
                    <button className="deposit-button">Deposit</button>

                    {/* Admin button - only visible for admin users */}
                    {isAdmin && (
                        <button
                            className="admin-button"
                            onClick={navigateToAdminPanel}
                        >
                            Admin
                        </button>
                    )}

                    <div className="user-profile">
                        <span className="username">
                            {userData?.display_name || getDisplayName(userData) || "Guest"}
                        </span>
                        <div className="profile-icon">
                            {(userData?.first_name?.[0] || userData?.email?.[0] || "U").toUpperCase()}
                        </div>
                    </div>

                    <button
                        className="logout-button"
                        onClick={() => {
                            localStorage.removeItem('auth_token');
                            navigate('/login');
                        }}
                    >
                        <span className="logout-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16 17 21 12 16 7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                        </span>
                        <span className="logout-text">Logout</span>
                    </button>
                </div>
            </header>

            <div className="dashboard-content">
                <nav className="side-navigation">
                    <ul>
                        <li className="nav-item" onClick={() => navigate('/dashboard')}>
                            <span className="nav-icon">📊</span>
                            <span className="nav-text">Dashboard</span>
                        </li>
                        <li className="nav-item" onClick={() => navigate('/markets')}>
                            <span className="nav-icon">💱</span>
                            <span className="nav-text">Markets</span>
                        </li>
                        <li className="nav-item">
                            <span className="nav-icon">💰</span>
                            <span className="nav-text">Trade</span>
                        </li>
                        <li className="nav-item active">
                            <span className="nav-icon">👤</span>
                            <span className="nav-text">Account Settings</span>
                        </li>
                        <li className="nav-item">
                            <span className="nav-icon">⚙️</span>
                            <span className="nav-text">System Settings</span>
                        </li>
                    </ul>
                </nav>

                <main className="main-content">
                    <div className="welcome-section">
                        <h2>Account Settings</h2>
                        <p>Manage your account preferences and security settings</p>
                    </div>

                    <div className="settings-content-wrapper">
                        {apiError && <div className="error-alert">{apiError}</div>}
                        {successMessage && <div className="success-message">{successMessage}</div>}

                        <div className="settings-card">
                            <h2>Account Information</h2>
                            <div className="settings-grid">
                                <div className="setting-item">
                                    <div className="setting-label">Username</div>
                                    <div className="setting-value">{userData?.username || 'N/A'}</div>
                                </div>
                                <div className="setting-item">
                                    <div className="setting-label">Email Address</div>
                                    <div className="setting-value">{userData?.email || 'N/A'}</div>
                                </div>
                                <div className="setting-item">
                                    <div className="setting-label">Member Since</div>
                                    <div className="setting-value">{formatDate(userData?.created_at)}</div>
                                </div>
                                <div className="setting-item">
                                    <div className="setting-label">Account Type</div>
                                    <div className="setting-value">
                                        {userData?.is_admin ? (
                                            <span className="badge admin">Administrator</span>
                                        ) : (
                                            <span className="badge user">Standard User</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="settings-card">
                            <h2>Security</h2>
                            <form onSubmit={handlePasswordReset} className="settings-form">
                                <div className="form-description">
                                    To reset your password, confirm your email address below and we'll send you a reset link.
                                </div>
                                <div className="form-group">
                                    <label htmlFor="email">Email Address</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        disabled={isPasswordResetRequested}
                                        required
                                        className="form-input"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className={isPasswordResetRequested ? "btn-primary disabled" : "btn-primary"}
                                    disabled={isPasswordResetRequested}
                                >
                                    {isPasswordResetRequested ? 'Email Sent' : 'Reset Password'}
                                </button>

                                {isPasswordResetRequested && (
                                    <div className="info-message">
                                        Check your inbox for the password reset link. The link will expire in 30 minutes.
                                    </div>
                                )}
                            </form>
                        </div>
                    </div>
                </main>
            </div>

            <footer className="dashboard-footer">
                <div className="footer-links">
                    <Link to="/about">About Us</Link>
                    <Link to="/terms">Terms of Service</Link>
                    <Link to="/privacy">Privacy Policy</Link>
                    <Link to="/support">Contact Support</Link>
                </div>
                <div className="copyright">
                    © 2025 CryptoX Exchange. All rights reserved.
                </div>
            </footer>
        </div>
    );
}

export default Settings;