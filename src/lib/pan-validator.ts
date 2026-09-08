/**
 * PAN (Permanent Account Number) Card Validator
 * 
 * Indian PAN format: 10 characters - 5 letters + 4 digits + 1 letter
 * Example: ABCDE1234F
 */

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

/**
 * Entity type mapping from the 4th character of PAN
 */
const ENTITY_TYPES: Record<string, string> = {
  'P': 'Individual',
  'C': 'Company',
  'H': 'HUF (Hindu Undivided Family)',
  'F': 'Firm',
  'A': 'AOP (Association of Persons)',
  'T': 'Trust',
  'B': 'BOI (Body of Individuals)',
  'L': 'Local Authority',
  'J': 'Artificial Juridical Person',
  'G': 'Government',
};

/**
 * Validates PAN card number format
 * @param pan - 10 character PAN string
 * @returns true if valid format, false otherwise
 */
export function isValidPan(pan: string): boolean {
  if (!pan || typeof pan !== 'string') {
    return false;
  }
  const normalized = pan.trim().toUpperCase();
  return PAN_REGEX.test(normalized);
}

/**
 * Determines entity type from PAN's 4th character
 * @param pan - 10 character PAN string
 * @returns entity type string or 'Unknown' if invalid
 */
export function panEntityType(pan: string): string {
  if (!isValidPan(pan)) {
    return 'Unknown';
  }
  const normalized = pan.trim().toUpperCase();
  const fourthChar = normalized[3] ?? ""; // 0-indexed, so 4th char is at index 3
  return ENTITY_TYPES[fourthChar] || 'Unknown';
}

/**
 * Masks PAN showing only first 2 and last 2 characters
 * @param pan - 10 character PAN string
 * @returns masked PAN string (e.g., "AB****EF") or original if invalid
 */
export function maskPan(pan: string): string {
  if (!isValidPan(pan)) {
    return pan || '';
  }
  const normalized = pan.trim().toUpperCase();
  return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`;
}

/**
 * Checks if PAN's 5th character matches last name initial
 * For individuals (P), 5th character should match first letter of last name
 * @param pan - 10 character PAN string
 * @param name - Full name string
 * @returns true if matches, false otherwise
 */
export function panMatchesName(pan: string, name: string): boolean {
  if (!isValidPan(pan) || !name || typeof name !== 'string') {
    return false;
  }
  
  const normalizedPan = pan.trim().toUpperCase();
  const normalizedName = name.trim().toUpperCase();
  
  // Get 5th character (index 4) from PAN
  const fifthChar = normalizedPan[4];
  
  // Extract last name initial (last word's first character)
  const nameParts = normalizedName.split(/\s+/).filter(part => part.length > 0);
  if (nameParts.length === 0) {
    return false;
  }
  
  const lastName = nameParts[nameParts.length - 1]!;
  const lastNameInitial = lastName[0];
  
  return fifthChar === lastNameInitial;
}