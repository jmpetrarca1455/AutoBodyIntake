import type { VinDecodeResult } from '@autobody/shared';

/**
 * VIN decode — free NHTSA public API (vpic.nhtsa.dot.gov), no API key
 * needed. This is the single highest-ROI "AI-adjacent" labor-saver in the
 * whole app: one field (VIN) auto-fills year/make/model/trim/body-class
 * instead of a customer or staff member typing four fields by hand, and
 * it's always available (no OpenAI dependency, no cost, no fallback logic
 * needed since NHTSA's database is authoritative).
 */
const NHTSA_ENDPOINT = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

interface NhtsaResult {
  ModelYear?: string;
  Make?: string;
  Model?: string;
  Trim?: string;
  BodyClass?: string;
  DriveType?: string;
  EngineCylinders?: string;
  FuelTypePrimary?: string;
  ErrorCode?: string;
}

export async function decodeVin(vin: string): Promise<VinDecodeResult> {
  const cleaned = vin.trim().toUpperCase();
  const empty: VinDecodeResult = {
    vin: cleaned,
    found: false,
    year: null,
    make: null,
    model: null,
    trim: null,
    bodyClass: null,
    driveType: null,
    engineCylinders: null,
    fuelType: null,
  };

  if (cleaned.length < 11 || cleaned.length > 17) {
    return empty;
  }

  try {
    const res = await fetch(`${NHTSA_ENDPOINT}/${encodeURIComponent(cleaned)}?format=json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return empty;

    const body = (await res.json()) as { Results?: NhtsaResult[] };
    const result = body.Results?.[0];
    if (!result || !result.Make) return empty;

    const year = result.ModelYear ? Number(result.ModelYear) : null;

    return {
      vin: cleaned,
      found: true,
      year: year && Number.isFinite(year) ? year : null,
      make: result.Make || null,
      model: result.Model || null,
      trim: result.Trim || null,
      bodyClass: result.BodyClass || null,
      driveType: result.DriveType || null,
      engineCylinders: result.EngineCylinders || null,
      fuelType: result.FuelTypePrimary || null,
    };
  } catch {
    // NHTSA outage/timeout — never block the form, just report "not found".
    return empty;
  }
}

