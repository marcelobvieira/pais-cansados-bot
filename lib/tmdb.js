import fetch from 'node-fetch';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

/**
 * Search for movies or TV shows on TMDB
 * @param {string} query - The search query
 * @param {string} type - 'movie' or 'tv'
 * @returns {Array} Array of search results
 */
export async function searchTMDB(query, type) {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY not configured');
  }

  const endpoint = type === 'movie' ? 'search/movie' : 'search/tv';
  const url = `${BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error searching TMDB:', error);
    throw error;
  }
}

/**
 * Get details of a movie or TV show
 * @param {number} id - The TMDB ID
 * @param {string} type - 'movie' or 'tv'
 * @returns {Object} Details object
 */
export async function getTMDBDetails(id, type) {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY not configured');
  }

  const endpoint = type === 'movie' ? `movie/${id}` : `tv/${id}`;
  const url = `${BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}&language=en-US`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching TMDB details:', error);
    throw error;
  }
}

/**
 * Extract country and year from TMDB details
 * @param {Object} details - TMDB details object
 * @param {string} type - 'movie' or 'tv'
 * @returns {Object} { country: string, year: string }
 */
export function extractCountryAndYear(details, type) {
  let country = '';
  let year = '';

  if (type === 'movie') {
    if (details.production_countries && details.production_countries.length > 0) {
      country = details.production_countries[0].name;
    }
    if (details.release_date) {
      year = details.release_date.split('-')[0];
    }
  } else if (type === 'tv') {
    if (details.origin_country && details.origin_country.length > 0) {
      country = details.origin_country[0];
    }
    if (details.first_air_date) {
      year = details.first_air_date.split('-')[0];
    }
  }

  return { country, year };
}