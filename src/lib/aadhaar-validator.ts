/**
 * Aadhaar validator with Verhoeff checksum algorithm
 * Based on UIDAI specification for Aadhaar number validation
 */

// Verhoeff algorithm multiplication table (d)
const verhoeffD: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

// Verhoeff algorithm permutation table (p)
const verhoeffP: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

// Verhoeff algorithm inverse table (inv)
const verhoeffInv: number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates an Aadhaar number using the Verhoeff checksum algorithm
 * @param aadhaar - Aadhaar number string (with or without spaces/hyphens)
 * @returns true if valid, false otherwise
 */
export function isValidAadhaar(aadhaar: string): boolean {
  // Strip spaces and hyphens
  const cleaned = aadhaar.replace(/[\s-]/g, '');

  // Check if exactly 12 digits
  if (!/^\d{12}$/.test(cleaned)) {
    return false;
  }

  // Check first digit is not 0 or 1
  if (cleaned[0] === '0' || cleaned[0] === '1') {
    return false;
  }

  // Verify Verhoeff checksum
  return verifyVerhoeff(cleaned);
}

/**
 * Verhoeff checksum verification
 * @param digits - 12-digit string
 * @returns true if checksum is valid
 */
function verifyVerhoeff(digits: string): boolean {
  let checksum = 0;

  // Process from right to left (least significant digit first)
  // The last digit is the check digit
  for (let i = 0; i < digits.length; i++) {
    const digit = parseInt(digits[digits.length - 1 - i], 10);
    const permuted = verhoeffP[i % 8][digit];
    checksum = verhoeffD[checksum][permuted];
  }

  return checksum === 0;
}

/**
 * Formats an Aadhaar number as XXXX XXXX XXXX
 * @param aadhaar - Aadhaar number string (with or without spaces/hyphens)
 * @returns Formatted Aadhaar number or original if invalid format
 */
export function formatAadhaar(aadhaar: string): string {
  const cleaned = aadhaar.replace(/[\s-]/g, '');

  if (!/^\d{12}$/.test(cleaned)) {
    return aadhaar; // Return original if not a valid 12-digit number
  }

  return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 8)} ${cleaned.slice(8, 12)}`;
}

/**
 * Masks an Aadhaar number showing only last 4 digits
 * @param aadhaar - Aadhaar number string (with or without spaces/hyphens)
 * @returns Masked Aadhaar number (XXXX XXXX 1234) or original if invalid format
 */
export function maskAadhaar(aadhaar: string): string {
  const cleaned = aadhaar.replace(/[\s-]/g, '');

  if (!/^\d{12}$/.test(cleaned)) {
    return aadhaar; // Return original if not a valid 12-digit number
  }

  const lastFour = cleaned.slice(-4);
  return `XXXX XXXX ${lastFour}`;
}

// Inverse permutation tables for check digit calculation
const verhoeffPInv: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  [2, 7, 0, 4, 8, 1, 3, 5, 9, 6],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
];

/**
 * Generates a valid Aadhaar number with correct Verhoeff checksum
 * Used for testing purposes only
 * @returns Valid 12-digit Aadhaar number string
 */
export function generateValidAadhaar(): string {
  // First digit: 2-9 (not 0 or 1)
  let digits = [Math.floor(Math.random() * 8) + 2];

  // Generate 10 random digits
  for (let i = 0; i < 10; i++) {
    digits.push(Math.floor(Math.random() * 10));
  }

  // Calculate check digit (12th digit) using Verhoeff algorithm
  let checksum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = digits[10 - i];
    const permuted = verhoeffP[i % 8][digit];
    checksum = verhoeffD[checksum][permuted];
  }

  // The check digit is chosen so that d[checksum][p[0][checkDigit]] = 0
  // Since p[0] is identity, checkDigit = verhoeffInv[checksum]
  const checkDigit = verhoeffInv[checksum];
  digits.push(checkDigit);

  return digits.join('');
}