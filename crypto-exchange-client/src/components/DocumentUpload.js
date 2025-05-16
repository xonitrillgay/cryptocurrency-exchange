import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './DocumentUpload.css';

function DocumentUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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

        const data = await response.json();

        if (response.ok) {
          // Check if the user has already completed basic verification
          if (data.verification) {
            setVerificationStatus(data.verification);
          } else {
            // Redirect to personal information verification
            navigate('/verify');
          }
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

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) {
      return;
    }

    // Check file type
    const fileType = selectedFile.type;
    if (fileType !== 'image/jpeg' && fileType !== 'image/png' && fileType !== 'application/pdf') {
      setApiError('Invalid file type. Please upload a JPG, PNG, or PDF file.');
      return;
    }

    // Check file size (limit to 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (selectedFile.size > maxSize) {
      setApiError('File size exceeds 5MB limit. Please upload a smaller file.');
      return;
    }

    setFile(selectedFile);
    setApiError('');

    // Use a single read operation for both purposes
    if (selectedFile.type === 'image/jpeg' || selectedFile.type === 'image/png') {
      const reader = new FileReader();
      reader.onload = () => {
        setFilePreview(reader.result);
        // Now we only read the file once
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setFilePreview(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      setApiError('Please select a file to upload');
      return;
    }

    setIsSubmitting(true);
    setApiError('');

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setApiError('Authentication error. Please log in again.');
        navigate('/login');
        return;
      }

      // Create form data
      const formData = new FormData();
      formData.append('document', file);

      const response = await fetch('http://localhost:8080/verify/id-document', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage('ID document uploaded successfully! It will be reviewed shortly.');
        // Update verification status
        setVerificationStatus({
          ...verificationStatus,
          id_document: {
            id_verification_status: data.status,
            id_front_path: data.file_path
          }
        });
        // Clear file selection
        setFile(null);
        setFilePreview(null);

        // Redirect to dashboard after short delay
        setTimeout(() => {
          navigate('/dashboard');
        }, 3000);
      } else {
        setApiError(data.error || 'Failed to upload document');
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      setApiError('Server connection error. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const navigateToDashboard = () => {
    navigate('/dashboard');
  };

  const renderStatus = () => {
    if (!verificationStatus || !verificationStatus.id_document) {
      return (
        <div className="status-card pending">
          <h3>Document Upload Required</h3>
          <p>To complete your verification, please upload a valid government-issued ID document.</p>
        </div>
      );
    }

    const status = verificationStatus.id_document.id_verification_status;

    if (status === 'pending_review') {
      return (
        <div className="status-card review">
          <h3>Document Under Review</h3>
          <p>Your document has been submitted and is being reviewed by our team. This process typically takes 1-3 business days.</p>
        </div>
      );
    } else if (status === 'approved') {
      return (
        <div className="status-card approved">
          <h3>Verification Complete</h3>
          <p>Your ID document has been verified successfully. You now have full access to all platform features.</p>
        </div>
      );
    } else if (status === 'rejected') {
      return (
        <div className="status-card rejected">
          <h3>Verification Failed</h3>
          <p>Your document was rejected. Please upload a new document that meets our requirements.</p>
        </div>
      );
    }

    return null;
  };

  if (isLoading) {
    return <div className="loading">Loading verification status...</div>;
  }

  return (
    <div className="document-upload-container">
      <div className="document-upload-card">
        <h2>ID Verification</h2>
        <p className="subtitle">Upload a government-issued ID to verify your identity</p>

        {renderStatus()}

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

        {(!verificationStatus?.id_document || verificationStatus?.id_document?.id_verification_status === 'rejected') && (
          <form onSubmit={handleSubmit}>
            <div className="upload-section">
              <div className="document-requirements">
                <h3>Document Requirements:</h3>
                <ul>
                  <li>Government-issued ID (passport, driver's license, ID card)</li>
                  <li>Document must be valid and not expired</li>
                  <li>All information must be clearly visible</li>
                  <li>Accepted formats: JPG, PNG, PDF</li>
                  <li>Maximum file size: 5MB</li>
                </ul>
              </div>

              <div className="upload-area">
                <input
                  type="file"
                  id="document-upload"
                  onChange={handleFileChange}
                  accept=".jpg,.jpeg,.png,.pdf"
                  className="file-input"
                />
                <label htmlFor="document-upload" className="file-label">
                  <span className="upload-icon">📄</span>
                  <span>Click to select a file</span>
                </label>

                {file && (
                  <div className="file-info">
                    <p>Selected file: {file.name}</p>
                    <p>Size: {(file.size / 1024).toFixed(2)} KB</p>
                    <p>Type: {file.type}</p>
                  </div>
                )}

                {filePreview && (
                  <div className="image-preview">
                    <img src={filePreview} alt="ID document preview" />
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="upload-button"
              disabled={isSubmitting || !file}
            >
              {isSubmitting ? 'Uploading...' : 'Upload Document'}
            </button>
          </form>
        )}

        {successMessage && (
          <div className="dashboard-navigation">
            <p>You will be redirected to your dashboard shortly...</p>
            <button
              className="dashboard-button"
              onClick={navigateToDashboard}
            >
              Go to Dashboard Now
            </button>
          </div>
        )}

        {verificationStatus?.id_document && !successMessage && (
          <div className="dashboard-navigation">
            <button
              className="dashboard-button"
              onClick={navigateToDashboard}
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentUpload;