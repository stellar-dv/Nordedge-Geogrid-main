import { NextResponse } from 'next/server'
import { Client } from '@googlemaps/google-maps-services-js'

// Create a reusable client instance
const client = new Client({})

// Simple in-memory cache for search results
// In production, you might want to use a more robust solution like Redis
const CACHE = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const MAX_CACHE_SIZE = 500; // Maximum cache entries

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export async function POST(request: Request) {
  let requestBody;
  
  try {
    requestBody = await request.json();
    const { query, location, radius, type, rankBy, pageToken } = requestBody;

    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
      console.error('Missing Google Maps API key in environment variables')
      return NextResponse.json(
        { error: 'API configuration error' },
        { status: 500 }
      )
    }
    
    // Generate a cache key from request parameters
    const cacheKey = JSON.stringify({
      query, location, radius, type, rankBy, pageToken
    });
    
    // Check cache first
    const cached = CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      // Return cached results
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'HIT'
        }
      });
    }
    
    // Use Google Text Search API for nationwide search when query is provided without specific location context
    const isNationwideSearch = query && (!location || radius > 50000);
    
    if (isNationwideSearch) {
      console.log(`Performing nationwide search for "${query}"${pageToken ? ' with page token' : ''}`)
      
      // Implement retry logic for API calls
      let lastError;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          // Build request parameters for a text search
          const params: any = {
            key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
            query: query,
          };
          
          // Use page token if provided
          if (pageToken) {
            params.pagetoken = pageToken;
          }
          
          // Add location bias if provided, but don't restrict to it
          if (location && location.lat && location.lng) {
            params.location = `${location.lat},${location.lng}`;
            params.radius = 50000; // 50km radius as location bias, not restriction
          }
          
          // Add timeout for the request
          const response = await client.textSearch({
            params: params,
            timeout: 5000 // 5 second timeout
          });
          
          // Handle different Google Places API status codes
          if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
            console.error(`Google Places API returned status: ${response.data.status}`, response.data.error_message)
            
            // Map specific error codes to appropriate responses
            // Using string comparison instead of enum for better compatibility
            const status = response.data.status as string;
            
            switch (status) {
              case 'ZERO_RESULTS':
                // This is not an error, just no results found
                const emptyResult = { results: [] };
                // Cache empty results for a shorter time
                storeInCache(cacheKey, emptyResult, CACHE_DURATION / 4);
                return NextResponse.json(emptyResult)
              
              case 'OVER_QUERY_LIMIT':
                // Too many requests - add an increasing delay before retrying
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
                continue; // Try again
                
              case 'REQUEST_DENIED':
                return NextResponse.json(
                  { error: 'API request was denied. Please check API key configuration.' },
                  { status: 403 }
                )
                
              case 'INVALID_REQUEST':
                return NextResponse.json(
                  { error: 'Invalid request parameters.' },
                  { status: 400 }
                )
                
              case 'UNKNOWN_ERROR':
                // Unknown error from Google - retry
                if (attempt < MAX_RETRIES - 1) {
                  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                  continue; // Try again
                }
                
                return NextResponse.json(
                  { error: 'Google Places API encountered an unknown error. Please try again.' },
                  { status: 500 }
                )
                
              default:
                return NextResponse.json(
                  { error: `Google Places API error: ${status}` },
                  { status: 500 }
                )
            }
          }
          
          // Format the results
          const formattedResults = {
            results: response.data.results.map((place) => ({
              name: place.name,
              place_id: place.place_id,
              rating: place.rating,
              user_ratings_total: place.user_ratings_total,
              vicinity: place.vicinity,
              formatted_address: place.formatted_address,
              types: place.types,
              geometry: place.geometry,
              photos: place.photos ? place.photos.map(photo => ({
                photo_reference: photo.photo_reference,
                height: photo.height,
                width: photo.width,
                html_attributions: photo.html_attributions
              })) : [],
              opening_hours: place.opening_hours
            })),
            nextPageToken: response.data.next_page_token || null
          };
          
          // Store in cache
          storeInCache(cacheKey, formattedResults);
          
          return NextResponse.json(formattedResults, {
            headers: {
              'Cache-Control': 'public, max-age=3600',
              'X-Cache': 'MISS'
            }
          });
        } catch (apiError: any) {
          lastError = apiError;
          console.error(`Google Places API Text Search attempt ${attempt + 1} failed:`, apiError.message);
          
          // Check if it's worth retrying
          if (apiError.message.includes('ECONNRESET') || 
              apiError.message.includes('ETIMEDOUT') ||
              apiError.message.includes('429') || // Too Many Requests
              apiError.message.includes('503')) { // Service Unavailable
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
            continue; // Try again
          }
          
          // For other errors, fail immediately
          break;
        }
      }
      
      // If we get here, all retries failed
      console.error('All retry attempts failed for Google Places API text search');
      return NextResponse.json(
        { error: lastError ? `API Error: ${lastError.message}` : 'Failed to connect to Google Places API' },
        { status: 500 }
      );
    } else {
      // Original nearby search logic with retry
      // Validate location data
      if (!location || typeof location !== 'object' || !('lat' in location) || !('lng' in location)) {
        return NextResponse.json(
          { error: 'Invalid location format. Must provide {lat, lng} object' },
          { status: 400 }
        )
      }
      
      // Validate radius
      const validRadius = typeof radius === 'number' && radius > 0 && radius <= 50000 
        ? radius 
        : 5000 // Default to 5km if invalid
      
      // Format location for the Google Places API (which expects it as string "lat,lng")
      const locationString = `${location.lat},${location.lng}`
      
      console.log(`Searching for "${query || 'nearby businesses'}" at location ${locationString} with radius ${validRadius}m${type ? `, type: ${type}` : ''}${pageToken ? ', with page token' : ''}`)
      
      // Implement retry for nearby search
      let lastError;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          // Build request parameters
          const params: any = {
            key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
            location: locationString,
            type: type || 'establishment',
          };
          
          // If using a page token, add it to the parameters
          if (pageToken) {
            params.pagetoken = pageToken;
          } else {
            // If rankBy is 'distance', radius must not be included
            if (rankBy === 'distance') {
              params.rankby = 'distance';
              // When using rankBy=distance, we need either a keyword, name, or type
              if (!query && !type) {
                params.type = 'establishment';
              }
            } else {
              params.radius = validRadius;
            }
            
            // Only include keyword if query is not empty
            if (query && query.trim() !== '') {
              params.keyword = query;
            }
          }

          const response = await client.placesNearby({
            params: params,
            timeout: 5000 // 5 second timeout
          });

          // Handle different Google Places API status codes
          if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
            console.error(`Google Places API returned status: ${response.data.status}`, response.data.error_message)
            
            // Map specific error codes to appropriate responses
            // Using string comparison instead of enum for better compatibility
            const status = response.data.status as string;
            
            switch (status) {
              case 'ZERO_RESULTS':
                // This is not an error, just no results found
                const emptyResult = { results: [] };
                // Cache empty results for a shorter time
                storeInCache(cacheKey, emptyResult, CACHE_DURATION / 4);
                return NextResponse.json(emptyResult);
              
              case 'OVER_QUERY_LIMIT':
                // Too many requests - add an increasing delay before retrying
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
                continue; // Try again
                
              case 'REQUEST_DENIED':
                return NextResponse.json(
                  { error: 'API request was denied. Please check API key configuration.' },
                  { status: 403 }
                )
                
              case 'INVALID_REQUEST':
                return NextResponse.json(
                  { error: 'Invalid request parameters.' },
                  { status: 400 }
                )
                
              case 'UNKNOWN_ERROR':
                // Unknown error from Google - retry
                if (attempt < MAX_RETRIES - 1) {
                  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                  continue; // Try again
                }
                
                return NextResponse.json(
                  { error: 'Google Places API encountered an unknown error. Please try again.' },
                  { status: 500 }
                )
                
              default:
                return NextResponse.json(
                  { error: `Google Places API error: ${status}` },
                  { status: 500 }
                )
            }
          }

          const formattedResults = {
            results: response.data.results.map((place) => ({
              name: place.name,
              place_id: place.place_id,
              rating: place.rating,
              user_ratings_total: place.user_ratings_total,
              vicinity: place.vicinity,
              types: place.types,
              geometry: place.geometry,
              photos: place.photos ? place.photos.map(photo => ({
                photo_reference: photo.photo_reference,
                height: photo.height,
                width: photo.width,
                html_attributions: photo.html_attributions
              })) : []
            })),
            nextPageToken: response.data.next_page_token || null
          };
          
          // Store results in cache
          storeInCache(cacheKey, formattedResults);
          
          return NextResponse.json(formattedResults, {
            headers: {
              'Cache-Control': 'public, max-age=3600',
              'X-Cache': 'MISS'
            }
          });
        } catch (apiError: any) {
          lastError = apiError;
          console.error(`Google Places Nearby Search attempt ${attempt + 1} failed:`, apiError.message);
          
          // Check if it's worth retrying
          if (apiError.message.includes('ECONNRESET') || 
              apiError.message.includes('ETIMEDOUT') ||
              apiError.message.includes('429') || // Too Many Requests
              apiError.message.includes('503')) { // Service Unavailable
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
            continue; // Try again
          }
          
          // For other errors, fail immediately
          break;
        }
      }
      
      // If we get here, all retries failed
      console.error('All retry attempts failed for Google Places API nearby search');
      return NextResponse.json(
        { error: lastError ? `API Error: ${lastError.message}` : 'Failed to connect to Google Places API' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in places-search API:', error);
    
    // Include diagnostic information for debugging
    const errorInfo = {
      error: 'Failed to process search request',
      message: error.message || String(error),
      requestData: requestBody || 'Could not parse request body'
    };
    
    return NextResponse.json(
      errorInfo,
      { status: 500 }
    );
  }
}

// Helper to store results in cache
function storeInCache(key: string, data: any, duration: number = CACHE_DURATION) {
  if (CACHE.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry if at capacity
    const oldestKey = Array.from(CACHE.keys())[0];
    CACHE.delete(oldestKey);
  }
  
  CACHE.set(key, { 
    data: data,
    timestamp: Date.now()
  });
  
  // Set expiration
  setTimeout(() => {
    CACHE.delete(key);
  }, duration);
}
