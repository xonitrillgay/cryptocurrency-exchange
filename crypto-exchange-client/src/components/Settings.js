import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Settings.css';

function Settings() {
    const navigate = useNavigate();
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isPasswordResetRequested, setIsPasswordResetRequested] = useState(false);
    const [email, setEmail] = useState('');

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const token = localStorage.getItem('auth_token');

                if (!token) {
                    navigate('/login');
                    return;
                }

                const userResponse = await fetch('http://localhost:8080/user/profile', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (userResponse.ok) {
                    const data = await userResponse.json();
                    setUserData(data.user);
                    setEmail(data.user.email || '');
                } else {
                    const errorData = await userResponse.json();
                    setApiError(errorData.error || 'Failed to fetch user data');

                    if (userResponse.status === 401) {
                        localStorage.removeItem('auth_token');
                        navigate('/login');
                    }
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
        return <div className="settings-loading">Loading your settings...</div>;
    }

    return (
        <div className="settings-container">
            <h1 className="page-title">Account Settings</h1>
            <div className="settings-content">
                {apiError && <div className="error-message">{apiError}</div>}
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
        </div>
    );
}

export default Settings;