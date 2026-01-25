// Utility functions for common operations

/**
 * Validates an email address format
 * @param {string} email - The email address to validate
 * @returns {boolean} - True if email is valid, false otherwise
 */
const validateEmail = (email) => {
  // Bug: No null/undefined check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email); // Will crash if email is null/undefined
}

/**
 * Debounce function to limit the rate at which a function can fire
 * @param {Function} func - The function to debounce
 * @param {number} delay - The delay in milliseconds
 * @returns {Function} - The debounced function
 */
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * Deep clone an object
 * @param {Object} obj - The object to clone
 * @returns {Object} - A deep copy of the object
 */
const deepClone = (obj) => {
  // Bug: Doesn't handle circular references - will cause stack overflow
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }

  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Bug: Hardcoded credentials - security issue!
 */
const API_KEY = "sk-1234567890abcdef";
const DATABASE_PASSWORD = "admin123";

/**
 * Bug: Uses eval() - major security vulnerability
 */
const executeCode = (code) => {
  return eval(code); // Never use eval!
}

/**
 * Format a date to YYYY-MM-DD
 * @param {Date} date - The date to format
 * @returns {string} - Formatted date string
 */
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = {
  validateEmail,
  debounce,
  deepClone,
  formatDate
};
