import React, { useState, useEffect, useCallback } from 'react';
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

    // New states for enhanced image viewing
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });

    // Replace the existing queue list rendering with this enhanced version
    const [thumbnailCache, setThumbnailCache] = useState({});

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

    // Memoize the fetchDocumentImage function
    const fetchDocumentImage = useCallback(async (filename) => {
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
    }, []);

    useEffect(() => {
        if (selectedVerification?.verification?.id_front_path) {
            console.log('Fetching document image:', selectedVerification.verification.id_front_path);
            fetchDocumentImage(selectedVerification.verification.id_front_path)
                .then(imageUrl => {
                    console.log('Loaded document image:', imageUrl);
                    setDocumentImage(imageUrl);
                });
        } else {
            setDocumentImage(null);
        }
    }, [selectedVerification, fetchDocumentImage]);

    // Handle opening the lightbox
    const openLightbox = () => {
        console.log('Opening lightbox with image:', documentImage);
        setLightboxOpen(true);
        // Reset zoom and position when opening lightbox
        setZoomLevel(1);
        setImagePosition({ x: 0, y: 0 });
    };

    // Handle closing the lightbox
    const closeLightbox = () => {
        setLightboxOpen(false);
    };

    // Handle zoom in
    const zoomIn = () => {
        setZoomLevel(prevZoom => Math.min(prevZoom + 0.25, 3));
    };

    // Handle zoom out
    const zoomOut = () => {
        setZoomLevel(prevZoom => Math.max(prevZoom - 0.25, 0.5));
    };

    // Handle reset zoom
    const resetZoom = () => {
        setZoomLevel(1);
        setImagePosition({ x: 0, y: 0 });
    };

    // Handle image drag/pan
    const startPan = (e) => {
        const startX = e.clientX;
        const startY = e.clientY;
        const startPosX = imagePosition.x;
        const startPosY = imagePosition.y;

        const handlePanMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;

            setImagePosition({
                x: startPosX + deltaX,
                y: startPosY + deltaY
            });
        };

        const stopPan = () => {
            document.removeEventListener('mousemove', handlePanMove);
            document.removeEventListener('mouseup', stopPan);
        };

        document.addEventListener('mousemove', handlePanMove);
        document.addEventListener('mouseup', stopPan);
    };

    // Modify the existing rendering for the ID document preview
    const renderIDDocumentPreview = () => {
        if (!selectedVerification?.verification?.id_front_path) {
            return <div className="no-document">No ID document has been uploaded.</div>;
        }

        return (
            <div className="id-document-preview">
                {documentImage ? (
                    <div
                        className="document-container"
                        onClick={(e) => {
                            e.preventDefault();
                            openLightbox();
                        }}
                    >
                        <img
                            src={documentImage}
                            alt="ID Document"
                            className="thumbnail-image"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWltYWdlLW9mZiI+PHBhdGggZD0iTTIgMkw1IDE1IDE2IDIyIDIyIDJ6Ij48L3BhdGg+PC9zdmc+';
                                e.target.classList.add('error-image');
                            }}
                        />
                        <div className="hover-overlay">
                            <span>Click to view full image</span>
                        </div>
                    </div>
                ) : (
                    <div className="loading-document">
                        <p>Loading document...</p>
                    </div>
                )}
                <div className="document-submission-info">
                    <p>Submitted: {formatDate(selectedVerification.verification.updated_at)}</p>
                </div>
            </div>
        );
    };

    // Render the lightbox
    const renderLightbox = () => {
        if (!lightboxOpen || !documentImage) return null;

        return (
            <div className="id-document-lightbox" onClick={(e) => {
                e.stopPropagation();
                closeLightbox();
            }}>
                <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                    <div className="lightbox-header">
                        <h3>ID Document - {getFullName(selectedVerification.verification)}</h3>
                        <button className="close-button" onClick={(e) => {
                            e.stopPropagation();
                            closeLightbox();
                        }}>×</button>
                    </div>

                    <div className="lightbox-body">
                        <div
                            className="image-container"
                            onMouseDown={(e) => {
                                if (zoomLevel > 1) {
                                    e.preventDefault();
                                    startPan(e);
                                }
                            }}
                        >
                            <img
                                src={documentImage}
                                alt="ID Document Full View"
                                style={{
                                    transform: `scale(${zoomLevel}) translate(${imagePosition.x / zoomLevel}px, ${imagePosition.y / zoomLevel}px)`,
                                    cursor: zoomLevel > 1 ? 'grab' : 'default'
                                }}
                                draggable="false"
                            />
                        </div>
                    </div>

                    <div className="lightbox-controls">
                        <button onClick={(e) => { e.stopPropagation(); zoomOut(); }} disabled={zoomLevel <= 0.5}>-</button>
                        <span>{Math.round(zoomLevel * 100)}%</span>
                        <button onClick={(e) => { e.stopPropagation(); zoomIn(); }} disabled={zoomLevel >= 3}>+</button>
                        <button className="reset-button" onClick={(e) => { e.stopPropagation(); resetZoom(); }}>Reset</button>
                    </div>
                </div>
            </div>
        );
    };

    // Memoize the getThumbnail function with useCallback
    const getThumbnail = useCallback(async (verification) => {
        if (!verification.id_front_path) return null;

        // Check cache first
        if (thumbnailCache[verification.id]) {
            return thumbnailCache[verification.id];
        }

        try {
            const imageUrl = await fetchDocumentImage(verification.id_front_path);
            if (imageUrl) {
                // Update cache
                setThumbnailCache(prev => ({
                    ...prev,
                    [verification.id]: imageUrl
                }));
                return imageUrl;
            }
        } catch (error) {
            console.error("Error loading thumbnail:", error);
        }
        return null;
    }, [thumbnailCache, fetchDocumentImage]);

    // Add useEffect to preload thumbnails for queue items
    useEffect(() => {
        const preloadThumbnails = async () => {
            for (const item of queue) {
                if (item.verification.id_front_path && !thumbnailCache[item.verification.id]) {
                    await getThumbnail(item.verification);
                }
            }
        };

        preloadThumbnails();
    }, [queue, getThumbnail, thumbnailCache]); // Added missing dependencies

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
                            {queue.map((item) => {
                                const thumbUrl = thumbnailCache[item.verification.id];

                                return (
                                    <div
                                        key={item.verification.id}
                                        className={`verification-item ${selectedVerification?.verification.id === item.verification.id ? 'selected' : ''}`}
                                        onClick={() => handleVerificationSelect(item)}
                                    >
                                        {/* Thumbnail preview */}
                                        {thumbUrl ? (
                                            <img
                                                src={thumbUrl}
                                                alt="ID Thumbnail"
                                                className="verification-thumb"
                                            />
                                        ) : (
                                            <div className="verification-thumb no-image">
                                                No ID
                                            </div>
                                        )}

                                        <div className="item-content">
                                            <div className="item-user-info">
                                                <div className="item-name">{getFullName(item.verification)}</div>
                                                <div className="item-email">{item.user?.email || 'Email not available'}</div>
                                            </div>
                                            <div className="item-date">
                                                Submitted: {formatDate(item.verification.updated_at)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
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
                                {renderIDDocumentPreview()}
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

            {/* Lightbox Component */}
            {renderLightbox()}
        </div>
    );
}

export default VerificationQueue;