import { NextResponse } from 'next/server'

// Cache for photo responses to reduce API calls
const PHOTO_CACHE = new Map<string, { data: ArrayBuffer, contentType: string, timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_CACHE_SIZE = 100; // Maximum number of photos to cache

export async function GET(request: Request) {
  try {
    // Extract query parameters
    const { searchParams } = new URL(request.url)
    const photoReference = searchParams.get('reference')
    const maxWidth = searchParams.get('maxwidth') || '400'
    const maxHeight = searchParams.get('maxheight') || '400'

    if (!photoReference) {
      console.warn('API call made without photo reference')
      return NextResponse.json({ error: 'Missing photo reference' }, { status: 400 })
    }

    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
      console.error('Missing Google Maps API key in environment')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    // Create cache key from the photo reference and dimensions
    const cacheKey = `${photoReference}_${maxWidth}_${maxHeight}`;
    
    // Check if we have this photo in cache
    const cached = PHOTO_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      // Return cached photo if it exists and isn't expired
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT'
        },
      });
    }

    // Build URL to Google's Places Photos API
    const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?photoreference=${photoReference}&maxwidth=${maxWidth}&maxheight=${maxHeight}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`

    // Fetch the image with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    try {
      const response = await fetch(googleUrl, { 
        signal: controller.signal,
        next: { revalidate: 86400 } // Use Next.js cache for 24 hours 
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error(`Error fetching photo: ${response.status} ${response.statusText}`);
        
        // Check for specific error codes
        if (response.status === 403 || response.status === 429) {
          return NextResponse.json({ error: 'API quota exceeded' }, { status: response.status });
        }
        
        // Return a fallback image that matches the requested dimensions
        return NextResponse.redirect(`https://via.placeholder.com/${maxWidth}x${maxHeight}?text=No+Image`);
      }

      // Get the image data
      const imageData = await response.arrayBuffer();
      
      // Get content type from response headers
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // Store in cache
      if (PHOTO_CACHE.size >= MAX_CACHE_SIZE) {
        // Remove oldest entry if cache is full
        const oldestKey = Array.from(PHOTO_CACHE.keys())[0];
        PHOTO_CACHE.delete(oldestKey);
      }
      
      PHOTO_CACHE.set(cacheKey, {
        data: imageData,
        contentType: contentType,
        timestamp: Date.now()
      });

      // Return the image with appropriate headers
      return new NextResponse(imageData, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
          'X-Cache': 'MISS'
        },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('Photo fetch timeout');
        return NextResponse.json({ error: 'Photo fetch timeout' }, { status: 504 });
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Error in place-photo API:', error);
    return NextResponse.json({ error: 'Failed to fetch photo' }, { status: 500 });
  }
} 