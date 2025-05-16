import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './VerifyIdentity.css';

// Country options for dropdown
const COUNTRIES = [
    { code: "AU", name: "Australia" },
    { code: "CA", name: "Canada" },
    { code: "FR", name: "France" },
    { code: "DE", name: "Germany" },
    { code: "GB", name: "United Kingdom" },
    { code: "UA", name: "Ukraine" },
    { code: "US", name: "United States" },
    // Add more countries as needed
];

function VerifyIdentity() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        dob_day: 0,
        dob_month: 0,
        dob_year: 0,
        street_address: '',
        apartment: '',
        city: '',
        postal_code: '',
        country_code: '',
        phone_number: '',
        occupation: ''
    });

    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [apiError, setApiError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [verificationStatus, setVerificationStatus] = useState(null);

    useEffect(() => {
        const fetchVerificationStatus = async () => {
            try {
                const token = localStorage.getItem('auth_token');

                // If no token, redirect to login
                if (!token) {
                    console.error("No authentication token found");
                    navigate('/login');
                    return;
                }

                const response = await fetch('http://localhost:8080/verify/status', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                // Handle all responses as JSON
                const data = await response.json();

                if (response.ok) {
                    // Check if verification exists and has data
                    if (data.verification) {
                        const verificationData = data.verification;

                        // Populate form with existing data - match field names with your form
                        setFormData({
                            first_name: verificationData.first_name || '',
                            last_name: verificationData.last_name || '',
                            dob_day: verificationData.dob_day || 0,
                            dob_month: verificationData.dob_month || 0,
                            dob_year: verificationData.dob_year || 0,
                            street_address: verificationData.street_address || '',
                            apartment: verificationData.apartment || '',
                            city: verificationData.city || '',
                            postal_code: verificationData.postal_code || '',
                            country_code: verificationData.country_code || '',
                            phone_number: verificationData.phone_number || '',
                            occupation: verificationData.occupation || ''
                        });

                        // Store verification status to show appropriate UI
                        setVerificationStatus(data.status);
                    }
                    // If status is "not_submitted", we'll just show the empty form
                } else {
                    if (response.status === 401) {
                        // Unauthorized - token expired or invalid
                        localStorage.removeItem('auth_token');
                        navigate('/login');
                    } else {
                        setApiError(data.error || 'Failed to fetch verification status');
                    }
                }
            } catch (error) {
                console.error('Error fetching verification status:', error);
                setApiError('Server connection error. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchVerificationStatus();
    }, [navigate]);

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData({
            ...formData,
            [name]: value
        });

        // Clear field-specific error when typing
        if (errors[name]) {
            setErrors({
                ...errors,
                [name]: ''
            });
        }
    };

    const validateForm = () => {
        const newErrors = {};

        // Validate required fields
        if (!formData.first_name.trim()) newErrors.first_name = 'First name is required';
        if (!formData.last_name.trim()) newErrors.last_name = 'Last name is required';

        // Validate DOB
        if (!formData.dob_day) newErrors.dob_day = 'Required';
        else if (formData.dob_day < 1 || formData.dob_day > 31)
            newErrors.dob_day = 'Invalid day';

        if (!formData.dob_month) newErrors.dob_month = 'Required';
        else if (formData.dob_month < 1 || formData.dob_month > 12)
            newErrors.dob_month = 'Invalid month';

        if (!formData.dob_year) newErrors.dob_year = 'Required';
        else if (formData.dob_year < 1900 || formData.dob_year > new Date().getFullYear() - 18)
            newErrors.dob_year = 'Must be at least 18 years old';

        // Validate address
        if (!formData.street_address.trim()) newErrors.street_address = 'Street address is required';
        if (!formData.city.trim()) newErrors.city = 'City is required';
        if (!formData.postal_code.trim()) newErrors.postal_code = 'Postal code is required';
        if (!formData.country_code) newErrors.country_code = 'Country is required';

        // Validate phone and occupation
        if (!formData.phone_number.trim()) newErrors.phone_number = 'Phone number is required';
        if (!formData.occupation.trim()) newErrors.occupation = 'Occupation is required';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (validateForm()) {
            setIsSubmitting(true);
            setApiError('');

            try {
                const token = localStorage.getItem('auth_token');

                if (!token) {
                    setApiError('Authentication error. Please log in again.');
                    navigate('/login');
                    return;
                }

                // Make sure formData has the right format
                const submissionData = {
                    first_name: formData.first_name,
                    last_name: formData.last_name,
                    dob_day: parseInt(formData.dob_day, 10) || 0,  // Convert to number
                    dob_month: parseInt(formData.dob_month, 10) || 0, // Convert to number
                    dob_year: parseInt(formData.dob_year, 10) || 0, // Convert to number
                    street_address: formData.street_address,
                    apartment: formData.apartment || "",  // Ensure not null
                    city: formData.city,
                    postal_code: formData.postal_code,
                    country_code: formData.country_code,
                    phone_number: formData.phone_number,
                    occupation: formData.occupation
                };

                console.log("Sending verification data:", submissionData);

                const response = await fetch('http://localhost:8080/verify', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(submissionData)
                });

                // Check if response is valid JSON
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const data = await response.json();

                    if (response.ok) {
                        setSuccessMessage('Verification information submitted successfully!');
                        setVerificationStatus('submitted');
                    } else {
                        setApiError(data.error || 'Failed to submit verification information');
                    }
                } else {
                    // Not JSON response
                    const text = await response.text();
                    console.error("Non-JSON response:", text);
                    setApiError("Server returned an invalid response. Please try again later.");
                }
            } catch (error) {
                console.error('Error submitting verification:', error);
                setApiError('Server connection error. Please try again later.');
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    if (isLoading) {
        return <div className="loading">Loading verification status...</div>;
    }

    return (
        <div className="verify-container">
            <div className="verify-card">
                <h2>Identity Verification</h2>
                <p className="subtitle">Please provide your personal information for KYC verification</p>

                {apiError && (
                    <div className="error-message">
                        {apiError}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-section">
                        <h3>Personal Information</h3>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="first_name">First Name</label>
                                <input
                                    type="text"
                                    id="first_name"
                                    name="first_name"
                                    value={formData.first_name}
                                    onChange={handleChange}
                                    className={errors.first_name ? 'error' : ''}
                                />
                                {errors.first_name && <span className="error-text">{errors.first_name}</span>}
                            </div>

                            <div className="form-group">
                                <label htmlFor="last_name">Last Name</label>
                                <input
                                    type="text"
                                    id="last_name"
                                    name="last_name"
                                    value={formData.last_name}
                                    onChange={handleChange}
                                    className={errors.last_name ? 'error' : ''}
                                />
                                {errors.last_name && <span className="error-text">{errors.last_name}</span>}
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Date of Birth</label>
                            <div className="date-inputs">
                                <div className="date-input">
                                    <input
                                        type="number"
                                        name="dob_day"
                                        placeholder="DD"
                                        min="1"
                                        max="31"
                                        value={formData.dob_day}
                                        onChange={handleChange}
                                        className={errors.dob_day ? 'error' : ''}
                                    />
                                    {errors.dob_day && <span className="error-text">{errors.dob_day}</span>}
                                </div>

                                <div className="date-input">
                                    <input
                                        type="number"
                                        name="dob_month"
                                        placeholder="MM"
                                        min="1"
                                        max="12"
                                        value={formData.dob_month}
                                        onChange={handleChange}
                                        className={errors.dob_month ? 'error' : ''}
                                    />
                                    {errors.dob_month && <span className="error-text">{errors.dob_month}</span>}
                                </div>

                                <div className="date-input year">
                                    <input
                                        type="number"
                                        name="dob_year"
                                        placeholder="YYYY"
                                        min="1900"
                                        max={new Date().getFullYear()}
                                        value={formData.dob_year}
                                        onChange={handleChange}
                                        className={errors.dob_year ? 'error' : ''}
                                    />
                                    {errors.dob_year && <span className="error-text">{errors.dob_year}</span>}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="form-section">
                        <h3>Address Information</h3>

                        <div className="form-group">
                            <label htmlFor="street_address">Street Address</label>
                            <input
                                type="text"
                                id="street_address"
                                name="street_address"
                                value={formData.street_address}
                                onChange={handleChange}
                                className={errors.street_address ? 'error' : ''}
                            />
                            {errors.street_address && <span className="error-text">{errors.street_address}</span>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="apartment">Apartment, Suite, etc. (optional)</label>
                            <input
                                type="text"
                                id="apartment"
                                name="apartment"
                                value={formData.apartment}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="city">City</label>
                                <input
                                    type="text"
                                    id="city"
                                    name="city"
                                    value={formData.city}
                                    onChange={handleChange}
                                    className={errors.city ? 'error' : ''}
                                />
                                {errors.city && <span className="error-text">{errors.city}</span>}
                            </div>

                            <div className="form-group">
                                <label htmlFor="postal_code">Postal Code</label>
                                <input
                                    type="text"
                                    id="postal_code"
                                    name="postal_code"
                                    value={formData.postal_code}
                                    onChange={handleChange}
                                    className={errors.postal_code ? 'error' : ''}
                                />
                                {errors.postal_code && <span className="error-text">{errors.postal_code}</span>}
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="country_code">Country</label>
                            <select
                                id="country_code"
                                name="country_code"
                                value={formData.country_code}
                                onChange={handleChange}
                                className={errors.country_code ? 'error' : ''}
                            >
                                <option value="">Select a country</option>
                                {COUNTRIES.map(country => (
                                    <option key={country.code} value={country.code}>{country.name}</option>
                                ))}
                            </select>
                            {errors.country_code && <span className="error-text">{errors.country_code}</span>}
                        </div>
                    </div>

                    <div className="form-section">
                        <h3>Additional Information</h3>

                        <div className="form-group">
                            <label htmlFor="phone_number">Phone Number</label>
                            <input
                                type="tel"
                                id="phone_number"
                                name="phone_number"
                                value={formData.phone_number}
                                onChange={handleChange}
                                className={errors.phone_number ? 'error' : ''}
                                placeholder="+1 (555) 123-4567"
                            />
                            {errors.phone_number && <span className="error-text">{errors.phone_number}</span>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="occupation">Occupation</label>
                            <input
                                type="text"
                                id="occupation"
                                name="occupation"
                                value={formData.occupation}
                                onChange={handleChange}
                                className={errors.occupation ? 'error' : ''}
                            />
                            {errors.occupation && <span className="error-text">{errors.occupation}</span>}
                        </div>
                    </div>

                    <button type="submit" className="verify-button" disabled={isSubmitting}>
                        {isSubmitting ? 'Submitting...' : 'Submit Verification'}
                    </button>
                </form>

                {(successMessage || verificationStatus) && (
                    <div className="verification-next-steps">
                        <div className="success-message">
                            {successMessage || 'Your personal information has been submitted.'}
                        </div>

                        <div className="next-steps-card">
                            <h3>Next Step: Document Verification</h3>
                            <p>To complete your identity verification, please upload a government-issued ID document.</p>
                            <button
                                className="document-upload-button"
                                onClick={() => navigate('/document-upload')}
                            >
                                Proceed to Document Upload
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default VerifyIdentity;