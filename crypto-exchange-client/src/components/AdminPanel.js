// filepath: /home/maria/Documents/cryptocurrency-exchange/crypto-exchange-client/src/components/AdminPanel.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminPanel.css';

function AdminPanel() {
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [verificationCount, setVerificationCount] = useState(0);
    const [userCount, setUserCount] = useState(0); // Add state for user count

    useEffect(() => {
        const checkAdminAccess = async () => {
            try {
                const token = localStorage.getItem('auth_token');

                if (!token) {
                    navigate('/login');
                    return;
                }

                // Check admin access
                const response = await fetch('http://localhost:8080/admin/check', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (response.ok) {
                    setIsAdmin(true);

                    // Get pending verification count
                    try {
                        const queueResponse = await fetch('http://localhost:8080/admin/queue', {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json',
                            },
                        });

                        if (queueResponse.ok) {
                            const data = await queueResponse.json();
                            setVerificationCount(data.queue?.length || 0);
                        }
                    } catch (error) {
                        console.error('Error fetching verification count:', error);
                    }

                    // Get total user count
                    try {
                        const usersResponse = await fetch('http://localhost:8080/admin/users', {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json',
                            },
                        });

                        if (usersResponse.ok) {
                            const data = await usersResponse.json();
                            setUserCount(data.users?.length || 0);
                        }
                    } catch (error) {
                        console.error('Error fetching user count:', error);
                    }
                } else {
                    // Not an admin, redirect to dashboard
                    navigate('/dashboard');
                }
            } catch (error) {
                console.error('Error checking admin access:', error);
                setApiError('Failed to verify admin access');
            } finally {
                setIsLoading(false);
            }
        };

        checkAdminAccess();
    }, [navigate]);

    if (isLoading) {
        return <div className="admin-loading">Verifying admin access...</div>;
    }

    if (apiError) {
        return <div className="admin-error">{apiError}</div>;
    }

    if (!isAdmin) {
        return <div className="admin-unauthorized">Unauthorized access</div>;
    }

    return (
        <div className="admin-panel">
            <header className="admin-header">
                <h1>Admin Panel</h1>
                <button className="back-button" onClick={() => navigate('/dashboard')}>
                    Return to Dashboard
                </button>
            </header>

            <div className="admin-content">
                <div className="admin-card">
                    <h2>User Management</h2>
                    <p>Manage user accounts, permissions, and verification status</p>
                    {userCount > 0 && (
                        <div className="user-badge">{userCount}</div>
                    )}
                    <button
                        className="admin-action-button"
                        onClick={() => navigate('/admin/users')}
                    >
                        Manage Users
                    </button>
                </div>

                <div className="admin-card verification-card">
                    <h2>Verification Queue</h2>
                    <p>Review pending ID verification requests</p>
                    {verificationCount > 0 && (
                        <div className="verification-badge">{verificationCount}</div>
                    )}
                    <button
                        className="admin-action-button"
                        onClick={() => navigate('/admin/queue')}
                    >
                        View Queue
                    </button>
                </div>

                <div className="admin-card">
                    <h2>System Settings</h2>
                    <p>Configure platform settings and parameters</p>
                    <button className="admin-action-button">Settings</button>
                </div>
            </div>
        </div>
    );
}

export default AdminPanel;