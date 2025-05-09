import { createClient } from "@supabase/supabase-js"
import { createRetryFunction } from "./geogrid-utils"

// Create a single Supabase client for interacting with your database
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  global: {
    // Add 5-second timeout on API calls to prevent hanging
    fetch: (url, options) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      return fetch(url, { 
        ...options, 
        signal: controller.signal 
      }).finally(() => clearTimeout(timeoutId));
    }
  }
})

interface BusinessRecord {
  name: string;
  address: string;
  place_id: string | null;
  lat: string | number;
  lng: string | number;
  category: string | null;
}

interface GridResultRecord {
  id: string;
  search_term: string;
  created_at: string;
  grid_size: string;
  grid_data: number[][];
  metrics: {
    agr: number;
    atgr: number;
    solv: string;
    averageRank: number;
    visibilityPercentage: number;
    top20AverageRank: number;
  };
  google_region: string;
  distance_km: string | number;
  businesses: BusinessRecord;
}

export interface GridResult {
  id: string;
  businessInfo: {
    name: string;
    address: string;
    location: { lat: number; lng: number };
    category?: string;
    placeId?: string;
  };
  searchTerm: string;
  createdAt: string;
  gridSize: string;
  gridData: number[][];
  metrics: {
    agr: number;
    atgr: number;
    solv: string;
    averageRank: number;
    visibilityPercentage: number;
    top20AverageRank: number;
  };
  googleRegion: string;
  distanceKm: number;
}

// Check if tables exist and create them if they don't
export async function initDatabase() {
  const initWithRetry = createRetryFunction(async () => {
    // Check if tables exist by attempting to select from them
    const { error: businessesError } = await supabase
      .from('businesses')
      .select('id')
      .limit(1);

    const { error: gridError } = await supabase
      .from('grid_results')
      .select('id')
      .limit(1);

    const { error: reviewsError } = await supabase
      .from('business_reviews')
      .select('id')
      .limit(1);

    // If we got errors, it likely means the tables don't exist
    // We'll need to create them through Supabase's interface or migration
    if (businessesError || gridError || reviewsError) {
      console.log('Some tables are missing. Please run the database migrations.');
      return false;
    }

    return true;
  }, 3, 1000);

  try {
    return await initWithRetry();
  } catch (error) {
    console.error('Failed to initialize database after retries:', error);
    return false;
  }
}

export async function saveGridResult(result: Omit<GridResult, "id">): Promise<GridResult> {
  const saveWithRetry = createRetryFunction(async () => {
    // First, save the business info
    const { data: businessData, error: businessError } = await supabase
      .from("businesses")
      .insert({
        name: result.businessInfo.name,
        address: result.businessInfo.address,
        place_id: result.businessInfo.placeId || null,
        lat: result.businessInfo.location.lat,
        lng: result.businessInfo.location.lng,
        category: result.businessInfo.category || null,
      })
      .select("id")
      .single()

    if (businessError) {
      console.error("Error inserting business:", businessError)
      throw businessError
    }

    if (!businessData || !businessData.id) {
      throw new Error("Failed to get business ID after insertion")
    }

    const businessId = businessData.id

    // Then, save the grid result
    const { data: gridData, error: gridError } = await supabase
      .from("grid_results")
      .insert({
        business_id: businessId,
        search_term: result.searchTerm,
        created_at: new Date(result.createdAt),
        grid_size: result.gridSize,
        grid_data: result.gridData,
        metrics: result.metrics,
        google_region: result.googleRegion,
        distance_km: result.distanceKm,
      })
      .select("id")
      .single()

    if (gridError) {
      console.error("Error inserting grid result:", gridError)
      throw gridError
    }

    if (!gridData || !gridData.id) {
      throw new Error("Failed to get grid result ID after insertion")
    }

    const gridId = gridData.id

    // Return the saved result with the generated ID
    return {
      id: gridId.toString(),
      ...result,
    }
  }, 3, 1000);

  try {
    return await saveWithRetry();
  } catch (error) {
    console.error("Error saving grid result to database after retries:", error);
    throw new Error(`Failed to save grid result: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getGridResults(): Promise<GridResult[]> {
  const getResultsWithRetry = createRetryFunction(async () => {
    const { data, error } = await supabase
      .from("grid_results")
      .select(`
        id,
        search_term,
        created_at,
        grid_size,
        grid_data,
        metrics,
        google_region,
        distance_km,
        businesses!inner (*)
      `)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching grid results:", error)
      throw error
    }

    if (!data || data.length === 0) {
      return []
    }

    // Transform the data to match the GridResult type
    return data.map((row: any) => {
      const businesses = row.businesses as unknown as BusinessRecord

      return {
        id: row.id.toString(),
        businessInfo: {
          name: businesses.name,
          address: businesses.address,
          location: {
            lat: Number(businesses.lat),
            lng: Number(businesses.lng),
          },
          category: businesses.category || undefined,
          placeId: businesses.place_id || undefined,
        },
        searchTerm: row.search_term,
        createdAt: new Date(row.created_at).toISOString(),
        gridSize: row.grid_size,
        gridData: row.grid_data,
        metrics: row.metrics,
        googleRegion: row.google_region,
        distanceKm: Number(row.distance_km),
      }
    })
  }, 3, 1000);

  try {
    return await getResultsWithRetry();
  } catch (error) {
    console.error("Error getting grid results after retries:", error);
    // Return empty array on error rather than throwing
    return [];
  }
}

export async function getGridResultById(id: string): Promise<GridResult | null> {
  try {
    const { data, error } = await supabase
      .from("grid_results")
      .select(`
        id,
        search_term,
        created_at,
        grid_size,
        grid_data,
        metrics,
        google_region,
        distance_km,
        businesses!inner (*)
      `)
      .eq("id", id)
      .single()

    if (error) {
      console.error("Error fetching grid result by ID:", error)
      return null
    }

    if (!data) {
      return null
    }

    const businesses = data.businesses as unknown as BusinessRecord

    return {
      id: data.id.toString(),
      businessInfo: {
        name: businesses.name,
        address: businesses.address,
        location: {
          lat: Number(businesses.lat),
          lng: Number(businesses.lng),
        },
        category: businesses.category || undefined,
        placeId: businesses.place_id || undefined,
      },
      searchTerm: data.search_term,
      createdAt: new Date(data.created_at).toISOString(),
      gridSize: data.grid_size,
      gridData: data.grid_data,
      metrics: data.metrics,
      googleRegion: data.google_region,
      distanceKm: Number(data.distance_km),
    }
  } catch (error) {
    console.error("Error getting grid result by ID from database:", error)
    return null
  }
}

export async function deleteGridResult(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("grid_results").delete().eq("id", id)

    if (error) {
      console.error("Error deleting grid result:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("Error deleting grid result from database:", error)
    return false
  }
}

export async function saveCompetitors(gridResultId: string, competitors: any[]): Promise<boolean> {
  try {
    // Prepare the data for insertion
    const competitorsData = competitors.map((competitor) => ({
      grid_result_id: gridResultId,
      name: competitor.name,
      address: competitor.address || null,
      rating: competitor.rating || null,
      user_ratings_total: competitor.userRatingsTotal || null,
      types: competitor.types || [],
      lat: competitor.location.lat,
      lng: competitor.location.lng,
    }))

    const { error } = await supabase.from("competitors").insert(competitorsData)

    if (error) {
      console.error("Error saving competitors:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("Error saving competitors to database:", error)
    return false
  }
}

export async function getCompetitors(gridResultId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase.from("competitors").select("*").eq("grid_result_id", gridResultId)

    if (error) {
      console.error("Error fetching competitors:", error)
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    return data.map((row) => ({
      id: row.id.toString(),
      name: row.name,
      address: row.address,
      rating: row.rating,
      userRatingsTotal: row.user_ratings_total,
      types: row.types,
      location: {
        lat: Number.parseFloat(row.lat),
        lng: Number.parseFloat(row.lng),
      },
    }))
  } catch (error) {
    console.error("Error getting competitors from database:", error)
    return []
  }
}

// Centralized error handling - to be used in UI components 
export function handleDatabaseError(error: unknown, fallbackMessage = "Database operation failed"): string {
  if (error instanceof Error) {
    // Don't expose internal error details in production
    if (process.env.NODE_ENV === 'development') {
      return `${fallbackMessage}: ${error.message}`;
    }
  }
  return fallbackMessage;
}
