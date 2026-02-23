export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = []
  if (!email) {
    errors.push('Email is required')
  } else if (!email.includes('@')) {
    errors.push('Email must contain @')
  } else if (email.length > 254) {
    errors.push('Email exceeds maximum length')
  } else {
    const [local, domain] = email.split('@')
    if (!local || local.length === 0) {
      errors.push('Email local part cannot be empty')
    }
    if (!domain || !domain.includes('.')) {
      errors.push('Email domain must contain a dot')
    }
  }
  return { valid: errors.length === 0, errors }
}

export function validatePassword(password: string): ValidationResult {
  const errors: string[] = []
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters')
  }
  if (password.length > 128) {
    errors.push('Password must be at most 128 characters')
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter')
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain a number')
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain a special character')
  }
  return { valid: errors.length === 0, errors }
}

export function validateUsername(username: string): ValidationResult {
  const errors: string[] = []
  if (username.length < 3) {
    errors.push('Username must be at least 3 characters')
  }
  if (username.length > 30) {
    errors.push('Username must be at most 30 characters')
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, underscores, and hyphens')
  }
  return { valid: errors.length === 0, errors }
}
