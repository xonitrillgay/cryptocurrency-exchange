import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './UserManagement.css';

function UserManagement() {
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [isChangingRole, setIsChangingRole] = useState(false);

    // Fetch users from the API
    const fetchUsers = useCallback(async () => {
        try {
            const token = localStorage.getItem('auth_token');

            if (!token) {
                navigate('/login');
                return;
            }

            const response = await fetch('http://localhost:8080/admin/users', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                setUsers(data.users || []);
            } else {
                if (response.status === 403) {
                    navigate('/dashboard');
                }

                try {
                    const error = await response.json();
                    setApiError(error.error || 'Failed to fetch users');
                } catch (e) {
                    setApiError('Failed to fetch users');
                }
            }
        } catch (error) {
            console.error('Error fetching users:', error);
            setApiError('Server connection error. Please try again later.');
        } finally {
            setIsLoading(false);
        }
    }, [navigate]);

    // Truncate long strings for better display
    const truncateText = (text, maxLength = 25) => {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    // Check admin access and fetch users
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
                    fetchUsers();
                } else {
                    navigate('/dashboard');
                }
            } catch (error) {
                console.error('Error checking admin access:', error);
                setApiError('Failed to verify admin access');
                setIsLoading(false);
            }
        };

        checkAdminAccess();
    }, [navigate, fetchUsers]);

    // Change user role
    const handleChangeRole = async (userId, makeAdmin) => {
        setApiError('');
        setSuccessMessage('');
        setIsChangingRole(true);

        try {
            const token = localStorage.getItem('auth_token');

            if (!token) {
                navigate('/login');
                return;
            }

            const response = await fetch(`http://localhost:8080/admin/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ is_admin: makeAdmin })
            });

            if (response.ok) {
                setSuccessMessage(`User role successfully updated to ${makeAdmin ? 'Admin' : 'User'}`);

                // Refresh user list
                await fetchUsers();

                // Clear success message after 3 seconds
                setTimeout(() => {
                    setSuccessMessage('');
                }, 3000);
            } else {
                let errorMessage = 'Failed to update user role';

                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    console.error('Error parsing error response:', e);
                }

                setApiError(errorMessage);
            }
        } catch (error) {
            console.error('Error updating user role:', error);
            setApiError(`Network error: ${error.message || 'Unknown error'}`);
        } finally {
            setIsChangingRole(false);
        }
    };

    // Filter users based on search query
    const filteredUsers = users.filter(user => {
        const query = searchQuery.toLowerCase();
        return (
            user.username.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query) ||
            (user.is_admin ? 'admin' : 'user').includes(query)
        );
    });

    // Format date for display
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (isLoading) {
        return <div className="admin-loading">Loading users...</div>;
    }

    if (!isAdmin) {
        return <div className="admin-unauthorized">Unauthorized access</div>;
    }

    return (
        <div className="user-management-container">
            <header className="user-management-header">
                <h1>User Management</h1>
                <button className="back-button" onClick={() => navigate('/admin')}>
                    Return to Admin Panel
                </button>
            </header>

            {apiError && (
                <div className="api-error-message">
                    <span className="error-icon">⚠️</span>
                    {apiError}
                </div>
            )}

            {successMessage && (
                <div className="api-success-message">
                    <span className="success-icon">✓</span>
                    {successMessage}
                </div>
            )}

            <div className="user-list-section">
                <div className="search-filter">
                    <input
                        type="text"
                        placeholder="Search by username, email or role (admin/user)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                </div>

                <div className="user-list">
                    <div className="user-list-header">
                        <div>Username</div>
                        <div>Email</div>
                        <div>Created</div>
                        <div>Current Role</div>
                        <div>Actions</div>
                    </div>

                    {filteredUsers.length === 0 ? (
                        <div className="no-users-message">
                            {searchQuery ? 'No users match your search' : 'No users found'}
                        </div>
                    ) : (
                        filteredUsers.map(user => (
                            <div
                                key={user.id}
                                className={`user-list-row ${selectedUser && selectedUser.id === user.id ? 'selected' : ''}`}
                                onClick={() => setSelectedUser(user)}
                            >
                                <div className="user-list-cell username">{truncateText(user.username)}</div>
                                <div className="user-list-cell email" title={user.email}>{truncateText(user.email)}</div>
                                <div className="user-list-cell date">{formatDate(user.created_at)}</div>
                                <div className="user-list-cell role">
                                    <span className={`role-badge ${user.is_admin ? 'admin' : 'user'}`}>
                                        {user.is_admin ? 'Admin' : 'User'}
                                    </span>
                                </div>
                                <div className="user-list-cell actions">
                                    {user.is_admin ? (
                                        <button
                                            className="role-button make-user"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleChangeRole(user.id, false);
                                            }}
                                            disabled={isChangingRole}
                                        >
                                            Make User
                                        </button>
                                    ) : (
                                        <button
                                            className="role-button make-admin"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleChangeRole(user.id, true);
                                            }}
                                            disabled={isChangingRole}
                                        >
                                            Make Admin
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {selectedUser && (
                <div className="user-details-panel">
                    <h2>User Details</h2>
                    <div className="user-detail">
                        <span className="detail-label">Username:</span>
                        <span className="detail-value">{selectedUser.username}</span>
                    </div>
                    <div className="user-detail">
                        <span className="detail-label">Email:</span>
                        <span className="detail-value">{selectedUser.email}</span>
                    </div>
                    <div className="user-detail">
                        <span className="detail-label">User ID:</span>
                        <span className="detail-value">{selectedUser.id}</span>
                    </div>
                    <div className="user-detail">
                        <span className="detail-label">Role:</span>
                        <span className="detail-value role">
                            <span className={`role-badge ${selectedUser.is_admin ? 'admin' : 'user'}`}>
                                {selectedUser.is_admin ? 'Admin' : 'User'}
                            </span>
                        </span>
                    </div>
                    <div className="user-detail">
                        <span className="detail-label">Created:</span>
                        <span className="detail-value">{formatDate(selectedUser.created_at)}</span>
                    </div>

                    <div className="user-actions">
                        <button
                            className={`role-change-button ${selectedUser.is_admin ? 'make-user' : 'make-admin'}`}
                            onClick={() => handleChangeRole(selectedUser.id, !selectedUser.is_admin)}
                            disabled={isChangingRole}
                        >
                            {selectedUser.is_admin ? 'Remove Admin Rights' : 'Grant Admin Rights'}
                        </button>
                        <button
                            className="close-button"
                            onClick={() => setSelectedUser(null)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default UserManagement;