import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import './Markets.css';

const Markets = () => {
    const navigate = useNavigate();
    const [markets, setMarkets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('all');
    const [userData, setUserData] = useState(null);
    const [marketStats, setMarketStats] = useState({
        totalCoins: 0,
        totalMarketCap: 0,
        totalVolume: 0,
        averageChange24h: 0
    });

    // Define API base URL
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

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

    useEffect(() => {
        // Fetch user data when component mounts
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
                    }
                } catch (tokenError) {
                    console.warn("Could not parse token for fallback user data:", tokenError);
                }

                // Try fetching user data from API
                try {
                    const userResponse = await fetch(`${API_BASE_URL}/user/profile`, {
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
                    } else {
                        // Handle 401 specifically
                        if (userResponse.status === 401) {
                            localStorage.removeItem('auth_token');
                            navigate('/login');
                            return;
                        }
                    }
                } catch (userApiError) {
                    console.warn("API error when fetching user data:", userApiError);
                    // Continue with fallback data
                }

            } catch (error) {
                console.error('Error fetching user data:', error);
            }
        };

        fetchUserData();

        // Fetch market data
        const fetchMarkets = async () => {
            try {
                setLoading(true);
                const response = await axios.get(`${API_BASE_URL}/api/markets`);
                const cryptocurrencies = response.data.cryptocurrencies;
                setMarkets(cryptocurrencies);

                // Calculate market statistics
                if (cryptocurrencies.length > 0) {
                    const totalMarketCap = cryptocurrencies.reduce((sum, crypto) => sum + crypto.market_cap, 0);
                    const totalVolume = cryptocurrencies.reduce((sum, crypto) => sum + crypto.volume_24h, 0);
                    const avgChange = cryptocurrencies.reduce((sum, crypto) => sum + crypto.percent_change_24h, 0) / cryptocurrencies.length;

                    setMarketStats({
                        totalCoins: cryptocurrencies.length,
                        totalMarketCap,
                        totalVolume,
                        averageChange24h: avgChange
                    });
                }

                setError(null);
            } catch (err) {
                setError('Failed to fetch market data. Please try again later.');
                console.error('Error fetching markets:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchMarkets();
        const intervalId = setInterval(fetchMarkets, 60000);
        return () => clearInterval(intervalId);
    }, [API_BASE_URL, navigate]);

    // Filter cryptocurrencies based on active tab
    const getFilteredMarkets = () => {
        switch (activeTab) {
            case 'gainers':
                return markets.filter(crypto => crypto.percent_change_24h > 0)
                    .sort((a, b) => b.percent_change_24h - a.percent_change_24h);
            case 'losers':
                return markets.filter(crypto => crypto.percent_change_24h < 0)
                    .sort((a, b) => a.percent_change_24h - b.percent_change_24h);
            default:
                return markets;
        }
    };

    const filteredMarkets = getFilteredMarkets();

    // Format currency values
    const formatPrice = (price) => {
        if (price < 0.01) {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 6
            }).format(price);
        }

        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(price);
    };

    // Format large numbers (market cap, volume)
    const formatLargeNumber = (num) => {
        if (num >= 1_000_000_000) {
            return `$${(num / 1_000_000_000).toFixed(2)}B`;
        } else if (num >= 1_000_000) {
            return `$${(num / 1_000_000).toFixed(2)}M`;
        } else {
            return `$${(num / 1_000).toFixed(2)}K`;
        }
    };

    // Format percent change
    const formatPercentChange = (change) => {
        const className = change >= 0 ? 'positive' : 'negative';
        const sign = change >= 0 ? '+' : '';
        return <span className={className}>{sign}{change.toFixed(2)}%</span>;
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
                    <div className="user-profile">
                        {/* Updated username display to match Dashboard.js */}
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
                        <li className="nav-item active">
                            <span className="nav-icon">💱</span>
                            <span className="nav-text">Markets</span>
                        </li>
                        <li className="nav-item">
                            <span className="nav-icon">💰</span>
                            <span className="nav-text">Trade</span>
                        </li>
                        <li className="nav-item" onClick={() => navigate('/settings')}>
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
                    <div className="welcome-section">
                        <h2>Cryptocurrency Markets</h2>
                        <p>Live prices and market data for top cryptocurrencies</p>
                    </div>

                    {/* Market Statistics Cards - Updated class for styling */}
                    <div className="market-stats-box">
                        <div className="stat-item">
                            <div className="stat-label">Total Cryptocurrencies</div>
                            <div className="stat-value">{marketStats.totalCoins}</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-label">Total Market Cap</div>
                            <div className="stat-value">${(marketStats.totalMarketCap / 1_000_000_000).toFixed(2)}B</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-label">24h Volume</div>
                            <div className="stat-value">${(marketStats.totalVolume / 1_000_000_000).toFixed(2)}B</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-label">Avg. 24h Change</div>
                            <div className={`stat-value ${marketStats.averageChange24h >= 0 ? 'positive' : 'negative'}`}>
                                {marketStats.averageChange24h >= 0 ? '+' : ''}
                                {marketStats.averageChange24h.toFixed(2)}%
                            </div>
                        </div>
                    </div>

                    <div className="market-overview">
                        <div className="section-header">
                            <h3>Markets</h3>
                            <div className="tabs">
                                <button
                                    className={`tab ${activeTab === 'all' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('all')}
                                >
                                    All Cryptocurrencies
                                </button>
                                <button
                                    className={`tab ${activeTab === 'gainers' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('gainers')}
                                >
                                    Top Gainers
                                </button>
                                <button
                                    className={`tab ${activeTab === 'losers' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('losers')}
                                >
                                    Top Losers
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="error-alert">
                                {error}
                            </div>
                        )}

                        {loading ? (
                            <div className="loading">Loading market data...</div>
                        ) : (
                            <div className="crypto-table">
                                <div className="table-header">
                                    <div className="col col-name">Name</div>
                                    <div className="col">Price</div>
                                    <div className="col">24h %</div>
                                    <div className="col">7d %</div>
                                    <div className="col">Market Cap</div>
                                    <div className="col">Volume (24h)</div>
                                    <div className="col col-actions"></div>
                                </div>

                                {filteredMarkets.length === 0 ? (
                                    <div className="no-data">
                                        No cryptocurrencies found for the selected filter.
                                    </div>
                                ) : (
                                    filteredMarkets.map(crypto => (
                                        <div className="table-row" key={crypto.id}>
                                            <div className="col col-name">
                                                <div className="crypto-icon">
                                                    {crypto.symbol.charAt(0)}
                                                </div>
                                                <div className="crypto-name-details">
                                                    <span className="crypto-name">{crypto.name}</span>
                                                    <span className="crypto-symbol">{crypto.symbol}</span>
                                                </div>
                                            </div>
                                            <div className="col">{formatPrice(crypto.price)}</div>
                                            <div className="col">{formatPercentChange(crypto.percent_change_24h)}</div>
                                            <div className="col">{formatPercentChange(crypto.percent_change_7d)}</div>
                                            <div className="col">{formatLargeNumber(crypto.market_cap)}</div>
                                            <div className="col">{formatLargeNumber(crypto.volume_24h)}</div>
                                            <div className="col col-actions">
                                                <button className="trade-button">Trade</button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
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
};

export default Markets;