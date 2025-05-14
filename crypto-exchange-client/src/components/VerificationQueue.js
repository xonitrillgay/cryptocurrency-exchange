import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './VerificationQueue.css';

function VerificationQueue() {
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [queue, setQueue] = useState([]);
    const [selectedVerification, setSelectedVerification] = useState(null);
    const [processingAction, setProcessingAction] = useState(false);
    const [documentImage, setDocumentImage] = useState(null);

    useEffect(() => {
        const checkAdminAndFetchQueue = async () => {
            try {
                const token = localStorage.getItem('auth_token');

                if (!token) {
                    navigate('/login');
                    return;
                }

                // First check admin access
                const adminResponse = await fetch('http://localhost:8080/admin/check', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (adminResponse.ok) {
                    setIsAdmin(true);

                    // Now fetch the verification queue
                    const queueResponse = await fetch('http://localhost:8080/admin/queue', {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    });

                    if (queueResponse.ok) {
                        const data = await queueResponse.json();
                        setQueue(data.queue || []);
                    } else {
                        // Handle error
                        const errorData = await queueResponse.json();
                        setApiError(errorData.error || 'Failed to fetch verification queue');
                    }
                } else {
                    // Not an admin, redirect to dashboard
                    navigate('/dashboard');
                }
            } catch (error) {
                console.error('Error in admin verification queue:', error);
                setApiError('Failed to load verification queue. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };

        checkAdminAndFetchQueue();
    }, [navigate]);

    const handleVerificationSelect = (verification) => {
        setSelectedVerification(verification);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    const getFullName = (verification) => {
        return `${verification.first_name} ${verification.last_name}`;
    };

    const getFullAddress = (verification) => {
        const apartment = verification.apartment ? `, ${verification.apartment}` : '';
        return `${verification.street_address}${apartment}, ${verification.city}, ${verification.postal_code}, ${verification.country_code}`;
    };

    const getDOB = (verification) => {
        return `${verification.dob_day}/${verification.dob_month}/${verification.dob_year}`;
    };

    const handleApproveVerification = async () => {
        if (!selectedVerification) return;
        await updateVerificationStatus(selectedVerification.verification.id, 'approved');
    };

    const handleRejectVerification = async () => {
        if (!selectedVerification) return;
        await updateVerificationStatus(selectedVerification.verification.id, 'rejected');
    };

    const updateVerificationStatus = async (verificationId, status) => {
        setProcessingAction(true);
        try {
            const token = localStorage.getItem('auth_token');

            const response = await fetch(`http://localhost:8080/admin/verify/${verificationId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status }),
            });

            if (response.ok) {
                // Remove the verification from the queue or update its status
                setQueue(queue.filter(item => item.verification.id !== verificationId));
                setSelectedVerification(null);
            } else {
                const errorData = await response.json();
                setApiError(errorData.error || `Failed to ${status} verification`);
            }
        } catch (error) {
            console.error(`Error ${status} verification:`, error);
            setApiError(`Failed to ${status} verification. Please try again.`);
        } finally {
            setProcessingAction(false);
        }
    };

    const goBack = () => {
        navigate('/admin');
    };

    const fetchDocumentImage = async (filename) => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token || !filename) return null;

            // Extract just the filename from the path if needed
            const actualFilename = filename.split('/').pop();

            const response = await fetch(`http://localhost:8080/admin/document/${actualFilename}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                return URL.createObjectURL(blob);
            } else {
                console.error('Failed to load document image:', response.status);
                return null;
            }
        } catch (error) {
            console.error('Error loading document image:', error);
            return null;
        }
    };

    useEffect(() => {
        if (selectedVerification?.verification?.id_front_path) {
            fetchDocumentImage(selectedVerification.verification.id_front_path)
                .then(imageUrl => setDocumentImage(imageUrl));
        } else {
            setDocumentImage(null);
        }
    }, [selectedVerification]);

    if (isLoading) {
        return <div className="verification-queue-loading">Loading verification queue...</div>;
    }

    if (!isAdmin) {
        return <div className="verification-queue-unauthorized">Unauthorized access</div>;
    }

    return (
        <div className="verification-queue-container">
            <header className="queue-header">
                <h1>Verification Queue</h1>
                <button className="back-button" onClick={goBack}>
                    Return to Admin Panel
                </button>
            </header>

            {apiError && (
                <div className="queue-error">
                    {apiError}
                </div>
            )}

            <div className="queue-content">
                <div className="queue-list">
                    <h2>Pending Verifications ({queue.length})</h2>

                    {queue.length === 0 ? (
                        <div className="queue-empty">
                            <p>No pending verifications in the queue.</p>
                        </div>
                    ) : (
                        <div className="verification-items">
                            {queue.map((item) => (
                                <div
                                    key={item.verification.id}
                                    className={`verification-item ${selectedVerification?.verification.id === item.verification.id ? 'selected' : ''}`}
                                    onClick={() => handleVerificationSelect(item)}
                                >
                                    <div className="item-user-info">
                                        <div className="item-name">{getFullName(item.verification)}</div>
                                        <div className="item-email">{item.user?.email || 'Email not available'}</div>
                                    </div>
                                    <div className="item-date">
                                        Submitted: {formatDate(item.verification.updated_at)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="verification-details">
                    {selectedVerification ? (
                        <>
                            <h2>Verification Details</h2>

                            <div className="details-section">
                                <h3>Personal Information</h3>
                                <div className="detail-row">
                                    <div className="detail-label">Name:</div>
                                    <div className="detail-value">{getFullName(selectedVerification.verification)}</div>
                                </div>
                                <div className="detail-row">
                                    <div className="detail-label">Date of Birth:</div>
                                    <div className="detail-value">{getDOB(selectedVerification.verification)}</div>
                                </div>
                                <div className="detail-row">
                                    <div className="detail-label">Email:</div>
                                    <div className="detail-value">{selectedVerification.user?.email || 'Email not available'}</div>
                                </div>
                                <div className="detail-row">
                                    <div className="detail-label">Phone:</div>
                                    <div className="detail-value">{selectedVerification.verification.phone_number}</div>
                                </div>
                                <div className="detail-row">
                                    <div className="detail-label">Occupation:</div>
                                    <div className="detail-value">{selectedVerification.verification.occupation}</div>
                                </div>
                            </div>

                            <div className="details-section">
                                <h3>Address Information</h3>
                                <div className="detail-row">
                                    <div className="detail-label">Address:</div>
                                    <div className="detail-value">{getFullAddress(selectedVerification.verification)}</div>
                                </div>
                            </div>

                            <div className="details-section">
                                <h3>ID Document</h3>
                                {selectedVerification.verification.id_front_path ? (
                                    <div className="id-document-preview">
                                        {documentImage ? (
                                            <img
                                                src={documentImage}
                                                alt="ID Document"
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWltYWdlLW9mZiI+PHBhdGggZD0iTTE4IDExdjoiPjwvcGF0aD48cGF0aCBkPSJNNyA0aC42YTIgMiAwIDAgMSAxLjQyLjU5TDEwLjQxIDYgMTMuNiA5LjE4YTIgMiAwIDAgMS41OSAxLjQydi44YTIgMiAwIDAgMSAyIDJINHYtN2EyIDIgMCAwIDEgMi0yeiI+PC9wYXRoPjxwYXRoIGQ9Ik0xMiAxNmE0IDQgMCAwIDEtNC00SDE2YTQgNCAwIDAgMS00IDR6Ij48L3BhdGg+PHBhdGggZD0ibCAyMiAyLTUgNSI+PC9wYXRoPjxwYXRoIGQ9Ik0yIDIyIDcgMTciPjwvcGF0aD48L3N2Zz4=';
                                                    e.target.classList.add('error-image');
                                                }}
                                            />
                                        ) : (
                                            <div className="loading-document">
                                                <p>Loading document...</p>
                                            </div>
                                        )}
                                        <div className="document-submission-info">
                                            <p>Submitted: {formatDate(selectedVerification.verification.updated_at)}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="no-document">No ID document has been uploaded.</div>
                                )}
                            </div>

                            <div className="verification-actions">
                                <button
                                    className="approve-button"
                                    onClick={handleApproveVerification}
                                    disabled={processingAction}
                                >
                                    {processingAction ? 'Processing...' : 'Approve Verification'}
                                </button>
                                <button
                                    className="reject-button"
                                    onClick={handleRejectVerification}
                                    disabled={processingAction}
                                >
                                    {processingAction ? 'Processing...' : 'Reject Verification'}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="no-verification-selected">
                            <p>Select a verification from the list to view details.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default VerificationQueue;