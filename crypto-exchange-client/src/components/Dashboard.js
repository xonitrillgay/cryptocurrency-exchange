import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Dashboard.css';

function Dashboard() {
    const navigate = useNavigate();
    const [userData, setUserData] = useState(null);
    const [verificationStatus, setVerificationStatus] = useState(null);
    const [topCryptos, setTopCryptos] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    // Enhanced function to get proper display name from user data
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

    // Add this function for the admin button
    const navigateToAdminPanel = () => {
        navigate('/admin');
    };

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const token = localStorage.getItem('auth_token');

                // Redirect to login if no token
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
                            // Add any other fields available in your JWT
                        };
                        setUserData(fallbackUserData);
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

                        // Ensure we extract the user data correctly from the response
                        const apiUserData = userDataResponse.user || userDataResponse;

                        // Set the user data
                        setUserData(apiUserData);

                        // Check and set admin status
                        if (apiUserData && apiUserData.is_admin) {
                            setIsAdmin(true);
                        }

                        console.log("user response", userResponse);
                        // Remove this line that's causing the error
                        // setUserData(userWithDisplayName);
                        console.log("User data fetched successfully");
                    } else {
                        // Handle 401 specifically
                        if (userResponse.status === 401) {
                            localStorage.removeItem('auth_token');
                            navigate('/login');
                            return;
                        }

                        console.warn(`Failed to fetch user data: ${userResponse.status}`);
                        // Continue with fallback data
                    }
                } catch (userApiError) {
                    console.warn("API error when fetching user data:", userApiError);
                    // Continue with fallback data
                }

                // Try fetching verification status
                try {
                    const verificationResponse = await fetch('http://localhost:8080/verify/status', {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    });

                    if (verificationResponse.ok) {
                        const verificationData = await verificationResponse.json();
                        setVerificationStatus(verificationData);

                        // Add this block - update userData with verification data
                        if (verificationData && verificationData.verification) {
                            setUserData(prevUserData => ({
                                ...prevUserData,
                                verification: verificationData.verification
                            }));
                        }
                    } else {
                        console.warn(`Failed to fetch verification status: ${verificationResponse.status}`);
                        // Set empty verification status as fallback
                        setVerificationStatus({ status: 'unknown' });
                    }
                } catch (verificationError) {
                    console.warn("API error when fetching verification status:", verificationError);
                    setVerificationStatus({ status: 'unknown' });
                }

                // Try fetching market data
                try {
                    const marketResponse = await fetch('http://localhost:8080/market/top-cryptos');
                    if (marketResponse.ok) {
                        const marketData = await marketResponse.json();
                        setTopCryptos(marketData.data || []);
                    } else {
                        // Use mock data as fallback
                        console.warn("Using mock market data");
                        setTopCryptos([
                            { symbol: 'BTC', price: '67842.50', change_24h: '2.5', volume_24h: '24500000000' },
                            { symbol: 'ETH', price: '3421.75', change_24h: '1.8', volume_24h: '12700000000' },
                            { symbol: 'SOL', price: '143.22', change_24h: '-2.1', volume_24h: '3200000000' },
                            { symbol: 'ADA', price: '0.45', change_24h: '-0.7', volume_24h: '950000000' },
                        ]);
                    }
                } catch (marketError) {
                    console.warn("API error when fetching market data:", marketError);
                    // Use mock data as fallback
                    setTopCryptos([
                        { symbol: 'BTC', price: '67842.50', change_24h: '2.5', volume_24h: '24500000000' },
                        { symbol: 'ETH', price: '3421.75', change_24h: '1.8', volume_24h: '12700000000' },
                        { symbol: 'SOL', price: '143.22', change_24h: '-2.1', volume_24h: '3200000000' },
                        { symbol: 'ADA', price: '0.45', change_24h: '-0.7', volume_24h: '950000000' },
                    ]);
                }

            } catch (error) {
                console.error('Error in dashboard data fetching:', error);
                setApiError('Could not load some dashboard components. You may have limited functionality.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserData();

        // Polling for price updates every 30 seconds
        const intervalId = setInterval(() => {
            fetch('http://localhost:8080/market/top-cryptos')
                .then(response => response.json())
                .then(data => setTopCryptos(data.data || []))
                .catch(err => console.error('Error updating prices:', err));
        }, 30000);

        return () => clearInterval(intervalId);
    }, [navigate]);

    if (isLoading) {
        return <div className="loading-container">Loading your dashboard...</div>;
    }

    // Determine which steps are completed
    const hasAccount = !!userData; // User is logged in, so account exists
    const hasPersonalInfo = !!(verificationStatus && verificationStatus.verification);
    const hasIdDocument = !!(hasPersonalInfo &&
        verificationStatus.verification.id_document &&
        verificationStatus.verification.id_document.id_verification_status !== 'rejected');
    const isVerified = !!(hasIdDocument &&
        verificationStatus.verification.id_document.id_verification_status === 'approved');

    // Assume deposit status - this would come from an API in a real application
    // For now, we'll just simulate it's not done
    const hasDeposited = false;

    const renderVerificationBanner = () => {
        // Don't show any verification banner if the user has already submitted both personal info and ID document
        if (hasPersonalInfo && hasIdDocument) {
            // If verification is pending or approved, don't show any banner prompting to verify
            return null;
        }
        // Only show verification banner if user needs to verify
        else if (!hasPersonalInfo) {
            return (
                <div className="verification-banner incomplete">
                    <div className="banner-content">
                        <div>
                            <h3>Complete Your Verification</h3>
                            <p>Verify your identity to unlock full trading features</p>
                        </div>
                        <button onClick={() => navigate('/verify')} className="verification-button">
                            Verify Now
                        </button>
                    </div>
                </div>
            );
        } else if (!hasIdDocument) {
            return (
                <div className="verification-banner partial">
                    <div className="banner-content">
                        <div>
                            <h3>ID Document Required</h3>
                            <p>Upload your ID to complete the verification process</p>
                        </div>
                        <button onClick={() => navigate('/document-upload')} className="verification-button">
                            Upload ID
                        </button>
                    </div>
                </div>
            );
        } else if (verificationStatus.verification.id_document.id_verification_status === 'pending_review') {
            return (
                <div className="verification-banner pending">
                    <div className="banner-content">
                        <div>
                            <h3>Verification In Progress</h3>
                            <p>Your documents are being reviewed. This may take 1-3 business days.</p>
                        </div>
                        <span className="status-label">Pending</span>
                    </div>
                </div>
            );
        }

        return null;
    };



    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="logo">CryptoX</div>
                <div className="header-actions">
                    <div className="search-container">
                        <input type="text" placeholder="Search..." className="search-input" />
                    </div>
                    <button className="deposit-button">Deposit</button>

                    {/* Add Admin Button if user is admin */}
                    {isAdmin && (
                        <button
                            className="admin-button"
                            onClick={navigateToAdminPanel}
                        >
                            Admin Panel
                        </button>
                    )}

                    <div className="user-profile">
                        <span className="username">
                            {userData?.display_name || getDisplayName(userData) || userData?.email?.split('@')[0]}
                        </span>
                        <div className="profile-icon">
                            {(userData?.first_name?.[0] || userData?.email?.[0] || "U").toUpperCase()}
                        </div>
                    </div>
                    <button className="logout-button" onClick={() => {
                        localStorage.removeItem('auth_token');
                        navigate('/login');
                    }}>
                        Logout
                    </button>
                </div>
            </header>

            <div className="dashboard-content">
                <nav className="side-navigation">
                    <ul>
                        <li className="nav-item active">
                            <span className="nav-icon">📊</span>
                            <span className="nav-text">Dashboard</span>
                        </li>
                        <li className="nav-item">
                            <span className="nav-icon">💱</span>
                            <span className="nav-text">Markets</span>
                        </li>
                        <li className="nav-item">
                            <span className="nav-icon">💰</span>
                            <span className="nav-text">Trade</span>
                        </li>
                        <li className="nav-item">
                            <span className="nav-icon">👤</span>
                            <span className="nav-text">Account</span>
                        </li>
                        <li className="nav-item">
                            <span className="nav-icon">⚙️</span>
                            <span className="nav-text">Settings</span>
                        </li>
                    </ul>
                </nav>

                <main className="main-content">
                    {renderVerificationBanner()}

                    <div className="welcome-section">
                        <h2>Welcome, {getDisplayName(userData)}!</h2>
                        <p>Start trading cryptocurrencies today</p>
                    </div>

                    <div className="user-profile-summary">
                        <div className="profile-header">
                            <h3>Account Information</h3>
                            {isVerified ? (
                                <span className="verified-badge">
                                    <span className="verified-icon">✓</span> Verified
                                </span>
                            ) : hasIdDocument ? (
                                <span className="pending-badge">
                                    <span className="pending-icon">⌛</span> Pending Approval
                                </span>
                            ) : (
                                <span className="unverified-badge">Unverified</span>
                            )}
                        </div>

                        <div className="profile-details">
                            <div className="profile-detail-item">
                                <div className="detail-label">Email</div>
                                <div className="detail-value">{userData?.email || 'Not provided'}</div>
                            </div>

                            <div className="profile-detail-item">
                                <div className="detail-label">Full Name</div>
                                <div className="detail-value">
                                    {userData?.username}
                                </div>
                            </div>

                            <div className="profile-detail-item">
                                <div className="detail-label">Member Since</div>
                                <div className="detail-value">
                                    {userData?.created_at
                                        ? new Date(userData.created_at).toLocaleDateString()
                                        : 'N/A'}
                                </div>
                            </div>

                            <div className="profile-detail-item">
                                <div className="detail-label">Account Level</div>
                                <div className="detail-value">
                                    {isVerified ? 'Verified Account' : (hasIdDocument ? 'Pending Verification' : 'Unverified Account')}
                                </div>
                            </div>
                        </div>

                        <div className="profile-actions">
                            <button className="profile-action-button" onClick={() => navigate('/account')}>
                                Manage Account
                            </button>
                            {!isVerified && (
                                <button
                                    className="profile-action-button verification-button"
                                    onClick={() => navigate(hasPersonalInfo ? '/document-upload' : '/verify')}
                                >
                                    Complete Verification
                                </button>
                            )}
                        </div>

                        {apiError && (
                            <div className="api-warning">
                                <p>{apiError}</p>
                                <p>Some features may not be fully functional.</p>
                            </div>
                        )}
                    </div>

                    {/* Get Started in 30 Seconds section */}
                    <div className="getting-started-section">
                        <h3>Get Started in 30 Seconds!</h3>

                        <div className="steps-container">
                            <div className={`step-card ${hasAccount ? 'completed' : ''}`}>
                                <div className="step-number">1</div>
                                <div className="step-icon">
                                    <span role="img" aria-label="Create Account">📧</span>
                                </div>
                                <h4>Create Account</h4>
                                <p>Provide your email address and check your inbox for a 6-digit verification code. Simply enter the code on the verification page to complete your signup.</p>
                                {hasAccount ? (
                                    <div className="step-status completed">Completed ✓</div>
                                ) : (
                                    <button className="step-button" onClick={() => navigate('/signup')}>
                                        Create Account
                                    </button>
                                )}
                            </div>

                            <div className={`step-card ${isVerified ? 'completed' : (hasPersonalInfo || hasIdDocument ? 'in-progress' : '')}`}>
                                <div className="step-number">2</div>
                                <div className="step-icon">
                                    <span role="img" aria-label="Verify Identity">🪪</span>
                                </div>
                                <h4>Verify Identity</h4>
                                <p>Complete your personal information and upload a government-issued ID to verify your identity.</p>
                                {isVerified ? (
                                    <div className="step-status completed">Completed ✓</div>
                                ) : hasIdDocument ? (
                                    <div className="step-status in-progress">In Review</div>
                                ) : hasPersonalInfo ? (
                                    <button className="step-button" onClick={() => navigate('/document-upload')}>
                                        Upload ID
                                    </button>
                                ) : (
                                    <button className="step-button" onClick={() => navigate('/verify')}>
                                        Verify Now
                                    </button>
                                )}
                            </div>

                            <div className={`step-card ${hasDeposited ? 'completed' : ''}`}>
                                <div className="step-number">3</div>
                                <div className="step-icon">
                                    <span role="img" aria-label="Make Deposit">💰</span>
                                </div>
                                <h4>Make Deposit</h4>
                                <p>Fund your account easily on the CryptoX Web or App.</p>
                                <button className="step-button" disabled={!isVerified}>
                                    {isVerified ? "Deposit Now" : "Verification Required"}
                                </button>
                            </div>

                            <div className="step-card">
                                <div className="step-number">4</div>
                                <div className="step-icon">
                                    <span role="img" aria-label="Start Trading">📊</span>
                                </div>
                                <h4>Start Trading</h4>
                                <p>Kick off your journey with your favorite Spot pairs or Futures contracts!</p>
                                <button className="step-button" disabled={!hasDeposited && !isVerified}>
                                    {isVerified && hasDeposited ? "Trade Now" : "Deposit Required"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="market-overview">
                        <div className="section-header">
                            <h3>Market Overview</h3>
                            <div className="tabs">
                                <button className="tab active">Popular</button>
                                <button className="tab">Derivatives</button>
                                <button className="tab">Spot</button>
                            </div>
                        </div>

                        <div className="crypto-table">
                            <div className="table-header">
                                <div className="col">Pair</div>
                                <div className="col">Last Price</div>
                                <div className="col">24h Change</div>
                                <div className="col">24h Volume</div>
                                <div className="col">Actions</div>
                            </div>

                            {topCryptos.length > 0 ? (
                                topCryptos.map((crypto, index) => (
                                    <div className="table-row" key={index}>
                                        <div className="col crypto-name">
                                            <span className="crypto-icon">{crypto.symbol.charAt(0)}</span>
                                            <span>{crypto.symbol}/USD</span>
                                        </div>
                                        <div className="col">${parseFloat(crypto.price).toLocaleString()}</div>
                                        <div className={`col ${parseFloat(crypto.change_24h) >= 0 ? 'positive' : 'negative'}`}>
                                            {parseFloat(crypto.change_24h) >= 0 ? '+' : ''}{crypto.change_24h}%
                                        </div>
                                        <div className="col">${parseFloat(crypto.volume_24h).toLocaleString()}</div>
                                        <div className="col">
                                            <button
                                                className="trade-button"
                                                disabled={!isVerified || !hasDeposited}
                                            >
                                                Trade
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="no-data">Loading market data...</div>
                            )}
                        </div>
                    </div>

                    {apiError && (
                        <div className="error-alert">
                            {apiError}
                        </div>
                    )}
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

export default Dashboard;