import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './SignUp.css';

function SignUp() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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

  // Password validation function that matches the Rust backend requirements
  const validatePassword = (password) => {
    const validationErrors = [];

    // Check length - minimum 12 characters
    if (password.length < 12) {
      validationErrors.push("Password must be at least 12 characters long");
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
      validationErrors.push("Password must contain at least 1 number");
    }

    // Check for at least one letter
    if (!/[a-zA-Z]/.test(password)) {
      validationErrors.push("Password must contain at least 1 letter");
    }

    // Check for at least one special character
    if (/^[a-zA-Z0-9]+$/.test(password)) {
      validationErrors.push("Password must contain at least 1 special character");
    }

    return validationErrors;
  };

  const validateForm = () => {
    const newErrors = {};

    // Validate username
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    }

    // Validate email format
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email address is invalid';
    }

    // Validate password with our comprehensive function
    const passwordErrors = validatePassword(formData.password);
    if (passwordErrors.length > 0) {
      // Display the first error in the form
      newErrors.password = passwordErrors[0];

      // Store all password errors for potential display
      newErrors.allPasswordErrors = passwordErrors;
    }

    // Validate password confirmation
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).filter(key => key !== 'allPasswordErrors').length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (validateForm()) {
      setIsSubmitting(true);

      try {
        const response = await fetch('http://localhost:8080/sign-up', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: formData.username,
            email: formData.email,
            password: formData.password
          })
        });

        const data = await response.json();

        if (response.ok) {
          // Store token in localStorage
          if (data.token) {
            localStorage.setItem('auth_token', data.token);

            // Store user data if needed
            if (data.user) {
              localStorage.setItem('user_id', data.user.id);
              localStorage.setItem('username', data.user.username);
            }

            // Success message
            setSuccessMessage('Account created successfully!');

            // Short delay before redirect for better UX
            setTimeout(() => {
              navigate('/verify');
            }, 1000);
          } else {
            setApiError('Authentication token not received from server');
          }
        } else {
          // API error
          setApiError(data.error || 'Failed to create account. Please try again.');
        }
      } catch (error) {
        console.error('Sign up error:', error);
        setApiError('Server connection error. Please try again later.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-card">
        <h2>Create Your Account</h2>

        {apiError && (
          <div className="error-message">
            {apiError}
          </div>
        )}

        {successMessage && (
          <div className="success-message">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className={errors.username ? 'error' : ''}
            />
            {errors.username && <span className="error-text">{errors.username}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={errors.email ? 'error' : ''}
            />
            {errors.email && <span className="error-text">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className={errors.password ? 'error' : ''}
            />
            {errors.password && <span className="error-text">{errors.password}</span>}

            {/* Display all password requirements */}
            <div className="password-requirements">
              <p>Password must:</p>
              <ul>
                <li className={formData.password.length >= 12 ? 'met' : ''}>
                  Be at least 12 characters long
                </li>
                <li className={/\d/.test(formData.password) ? 'met' : ''}>
                  Contain at least 1 number
                </li>
                <li className={/[a-zA-Z]/.test(formData.password) ? 'met' : ''}>
                  Contain at least 1 letter
                </li>
                <li className={!/^[a-zA-Z0-9]+$/.test(formData.password) && formData.password.length > 0 ? 'met' : ''}>
                  Contain at least 1 special character
                </li>
              </ul>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={errors.confirmPassword ? 'error' : ''}
            />
            {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
          </div>

          <button type="submit" className="signup-button" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>

        <p className="login-link">
          Already have an account? <a href="/login">Log in</a>
        </p>
      </div>
    </div>
  );
}

export default SignUp;