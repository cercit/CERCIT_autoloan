
export interface ParsedAddress {
  fullAddress: string;
  name: string;
  pincode: string;
  city: string;
  state: string;
  documentType: string;
  issueDate: string;
  confidence: "high" | "medium" | "low";
}

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
];

const MAJOR_CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata",
  "Pune", "Ahmedabad", "Jaipur", "Surat", "Lucknow", "Kanpur",
  "Nagpur", "Indore", "Thane", "Bhopal", "Visakhapatnam", "Patna",
  "Vadodara", "Ghaziabad", "Ludhiana", "Agra", "Nashik", "Faridabad",
  "Meerut", "Rajkot", "Varanasi", "Srinagar", "Aurangabad", "Dhanbad",
  "Amritsar", "Allahabad", "Ranchi", "Howrah", "Coimbatore", "Jabalpur",
  "Gwalior", "Vijayawada", "Jodhpur", "Raipur", "Kota", "Guwahati",
];

export function parseAddressProof(text: string): ParsedAddress {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const fullText = text.toLowerCase();

  let name = "";
  const namePatterns = [
    /(?:consumer|customer|tenant|applicant|holder|name)[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
  ];
  for (const pat of namePatterns) {
    for (const line of lines) {
      const m = line.match(pat);
      if (m && m[1] && m[1].length > 2) {
        name = m[1].trim();
        break;
      }
    }
  }

  const pincodeMatch = text.match(/\b([1-9][0-9]\d{4})\b/);
  const pincode = pincodeMatch?.[1] ?? "";

  let state = "";
  for (const s of INDIAN_STATES) {
    if (text.toLowerCase().includes(s.toLowerCase())) {
      state = s;
      break;
    }
  }

  let city = "";
  for (const c of MAJOR_CITIES) {
    if (text.toLowerCase().includes(c.toLowerCase())) {
      city = c;
      break;
    }
  }

  const docTypeCandidates = ["electricity", "water", "gas", "telephone", "rent", "agreement"];
  let documentType = "address_proof";
  for (const dt of docTypeCandidates) {
    if (fullText.includes(dt)) {
      documentType = dt + "_bill";
      break;
    }
  }

  const dateMatch = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{2}-[a-z]{3}-\d{4})\b/i);
  const issueDate = dateMatch?.[1] ?? "";

  const confidence: "high" | "medium" | "low" = name && pincode ? (state ? "high" : "medium") : (name || pincode ? "low" : "low");

  return { fullAddress: text.slice(0, 200).trim(), name: name || "Not found", pincode, city: city || "Not found", state: state || "Not found", documentType, issueDate, confidence };
}
