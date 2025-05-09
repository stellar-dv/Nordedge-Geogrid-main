/**
 * GeoGrid Utilities
 * Production-grade utility functions for the GeoGrid application
 */

/**
 * Calculate distance between two coordinates using the Haversine formula
 * @param lat1 First latitude
 * @param lng1 First longitude
 * @param lat2 Second latitude
 * @param lng2 Second longitude
 * @returns Distance in kilometers
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Calculate precise latitude/longitude conversion factors
 * @param latitude The latitude for which to calculate the conversion factors
 * @returns Object with ratios for converting km to degrees
 */
export function getCoordinateRatios(latitude: number) {
  // Convert 1 km to degrees of latitude
  const latKmRatio = 1 / 111.32; // Approximate km per degree of latitude
  
  // Convert 1 km to degrees of longitude (varies with latitude)
  const lngKmRatio = 1 / (111.32 * Math.cos(latitude * Math.PI / 180));
  
  return {
    latKmRatio,
    lngKmRatio
  };
}

/**
 * Calculate the grid starting point coordinates
 * @param centerLat Center latitude
 * @param centerLng Center longitude
 * @param gridSize Size of the grid
 * @param distanceKm Distance between grid points in kilometers
 * @returns Object with start latitude and longitude
 */
export function calculateGridStart(centerLat: number, centerLng: number, gridSize: number, distanceKm: number) {
  const { latKmRatio, lngKmRatio } = getCoordinateRatios(centerLat);
  
  // Calculate the starting coordinates for the grid
  // This centers the grid on the given coordinates
  const startLat = centerLat - (distanceKm * latKmRatio * (gridSize - 1)) / 2;
  const startLng = centerLng - (distanceKm * lngKmRatio * (gridSize - 1)) / 2;
  
  return {
    startLat,
    startLng,
    latKmRatio,
    lngKmRatio
  };
}

/**
 * Calculate grid point coordinates for a specific position
 * @param startLat Starting latitude
 * @param startLng Starting longitude
 * @param row Grid row
 * @param col Grid column
 * @param distanceKm Distance between grid points in kilometers
 * @param latKmRatio Latitude/km ratio
 * @param lngKmRatio Longitude/km ratio
 * @returns Coordinates of the grid point
 */
export function calculateGridPointCoordinates(
  startLat: number, 
  startLng: number, 
  row: number, 
  col: number, 
  distanceKm: number,
  latKmRatio: number,
  lngKmRatio: number
) {
  const lat = startLat + row * distanceKm * latKmRatio;
  const lng = startLng + col * distanceKm * lngKmRatio;
  
  return { lat, lng };
}

/**
 * Ensures a business is at the correct position in the results list
 * @param businesses Array of business results
 * @param targetBusinessName Name of the business to position correctly
 * @param targetPosition Target position in the array (0-indexed)
 * @returns Reordered array of businesses
 */
export function ensureBusinessAtPosition(businesses: any[], targetBusinessName: string, targetPosition: number): any[] {
  if (!businesses || businesses.length === 0) {
    return [];
  }
  
  // Make a copy of the array to avoid mutating the original
  const result = [...businesses];
  
  // Find the target business by name (case-insensitive partial match)
  const targetIndex = result.findIndex(business => 
    business.name.toLowerCase().includes(targetBusinessName.toLowerCase())
  );
  
  // If found but not at the target position, move it
  if (targetIndex !== -1 && targetIndex !== targetPosition) {
    // Remove from current position
    const targetBusiness = result.splice(targetIndex, 1)[0];
    
    // Clamp the target position to array bounds
    const insertPosition = Math.min(targetPosition, result.length);
    
    // Insert at the target position
    result.splice(insertPosition, 0, targetBusiness);
  }
  
  return result;
}

/**
 * Generate a color for a ranking value
 * @param ranking The ranking value
 * @returns A CSS color string
 */
export function getRankingColor(ranking: number): string {
  if (ranking <= 3) return "#059669"; // emerald-600 for top 3
  if (ranking <= 7) return "#10b981"; // green-500 for 4-7
  if (ranking <= 10) return "#f59e0b"; // amber-500 for 8-10
  if (ranking <= 15) return "#f97316"; // orange-500 for 11-15
  if (ranking >= 16) return "#ef4444"; // red-500 for 16 and above (including 20+)
  return "#ef4444"; // fallback to red-500
}

/**
 * Format a date string by removing the time component
 * @param dateString The date string to format
 * @returns Formatted date string
 */
export function formatDateNoTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
}

/**
 * Safely clean up object URLs to prevent memory leaks
 * @param urls Array of object URLs to revoke
 */
export function revokeObjectUrls(urls: (string | null | undefined)[]): void {
  urls.forEach(url => {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Error revoking object URL:', e);
      }
    }
  });
}

/**
 * Create a retry function that attempts an operation multiple times
 * @param operation The async function to retry
 * @param maxRetries Maximum number of retry attempts
 * @param delayMs Delay between retries in milliseconds
 * @returns A function that will retry the operation
 */
export function createRetryFunction<T>(
  operation: () => Promise<T>, 
  maxRetries: number = 3, 
  delayMs: number = 1000
): () => Promise<T> {
  return async function() {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Attempt ${attempt + 1} failed: ${lastError.message}`);
        
        if (attempt < maxRetries - 1) {
          // Wait before next attempt with exponential backoff
          await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
        }
      }
    }
    
    throw new Error(lastError ? `All ${maxRetries} attempts failed: ${lastError.message}` : 'Operation failed');
  };
} 