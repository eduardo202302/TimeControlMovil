/**
 * Reglas de la tab "Dirección" del formulario de Usuario (webapp:
 * Master/Company/Modals/Components/AdressEntity + Modals/MapAddressSelector
 * + Components/DraggableMap).
 *
 * Mismo criterio que userFormRules.ts: sin react-native ni expo-*, testeable
 * con jest. La red usa `fetch` directo contra las APIs REST de Google
 * (Places Autocomplete Legacy + Geocoding) — sin librería de Places.
 */

import type { Address } from "../../types/typeStore/SchoolStoreType";

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Centro por defecto de DraggableMap (Santo Domingo). */
export const DEFAULT_MAP_CENTER = { lat: 18.461174, lng: -69.941578 } as const;

/**
 * Delta de react-native-maps equivalente al `zoom={12}` de google-maps-react:
 * a zoom z un tile de 256px cubre 360/2^z grados; en un mapa de ~400px de
 * ancho eso da ≈0.13°.
 */
export const DEFAULT_MAP_DELTA = 0.13;

/** Restricción de país del autocomplete (componentRestrictions del webapp). */
export const ADDRESS_COUNTRY = "do";

/** Debounce del buscador de direcciones. */
export const ADDRESS_SEARCH_DEBOUNCE_MS = 450;

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

/** Los campos con input propio en MapAddressSelector, más formattedAddress. */
export const ADDRESS_TEXT_FIELDS = [
  "title",
  "province",
  "city",
  "sector",
  "zone",
  "street",
  "streetNumber",
  "building",
  "apartmentNumber",
  "postalCode",
  "phone",
  "referenceToArrive",
  "formattedAddress",
] as const;
export type AddressTextField = (typeof ADDRESS_TEXT_FIELDS)[number];

export type AddressDraft = Record<AddressTextField, string>;

/** Los obligatorios de getDisabled() en MapAddressSelector. */
export const REQUIRED_ADDRESS_FIELDS: AddressTextField[] = [
  "province",
  "city",
  "sector",
  "street",
  "streetNumber",
];

export interface GeocodeResult {
  formatted_address?: string;
  place_id?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  address_components?: { long_name?: string; short_name?: string; types?: string[] }[];
}

// ─── Borrador ────────────────────────────────────────────────────────────────

export function emptyAddressDraft(): AddressDraft {
  return ADDRESS_TEXT_FIELDS.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {} as AddressDraft);
}

function isLatLng(value: unknown): value is LatLng {
  const v = value as Partial<LatLng> | null | undefined;
  return typeof v?.lat === "number" && typeof v?.lng === "number";
}

/**
 * Coordenadas guardadas de una dirección: `location` (lo que guarda el
 * webapp) o latitude/longitude. null si no hay — caso "solo texto".
 */
export function addressLocation(address: Address | null | undefined): LatLng | null {
  if (!address) return null;
  if (isLatLng(address.location)) return { lat: address.location.lat, lng: address.location.lng };
  if (typeof address.latitude === "number" && typeof address.longitude === "number") {
    return { lat: address.latitude, lng: address.longitude };
  }
  return null;
}

/** El useEffect de carga de MapAddressSelector: cada campo o "". */
export function draftFromAddress(address: Address | null | undefined): AddressDraft {
  const draft = emptyAddressDraft();
  if (!address) return draft;
  ADDRESS_TEXT_FIELDS.forEach((key) => {
    const value = address[key];
    draft[key] = value === null || value === undefined ? "" : String(value);
  });
  return draft;
}

export function isAddressDraftComplete(draft: AddressDraft): boolean {
  return REQUIRED_ADDRESS_FIELDS.every((key) => draft[key].trim().length > 0);
}

export function isAddressDraftEmpty(draft: AddressDraft): boolean {
  return ADDRESS_TEXT_FIELDS.every((key) => draft[key] === "");
}

/**
 * addressFormatter() de MapAddressSelector, 1:1 — incluida su rareza: si no
 * hay calle arranca de "calle número, ciudad, provincia" y luego vuelve a
 * concatenar. Con calle da "calle número, zona, sector, ciudad, provincia".
 */
export function formatAddress(draft: AddressDraft): string {
  const { street, streetNumber, zone, sector, city, province } = draft;
  let formatted = `${street} ${streetNumber}, ${city}, ${province}`;
  if (street) formatted = street;
  if (streetNumber) formatted = `${formatted} ${streetNumber}`;
  if (zone) formatted = `${formatted}, ${zone}`;
  if (sector) formatted = `${formatted}, ${sector}`;
  if (city) formatted = `${formatted}, ${city}`;
  if (province) formatted = `${formatted}, ${province}`;
  return formatted;
}

// ─── Reverse geocode → campos ────────────────────────────────────────────────

/**
 * geocodeDataHandler de MapAddressSelector: pisa los 7 campos que vienen de
 * Google ("" si Google no devuelve ese componente). Title, edificio,
 * apartamento, teléfono y referencias no se tocan.
 */
export function applyGeocodeToDraft(draft: AddressDraft, result: GeocodeResult): AddressDraft {
  const components = Array.isArray(result.address_components) ? result.address_components : [];
  const pick = (type: string) =>
    components.find((component) => component.types?.includes(type))?.long_name ?? "";
  return {
    ...draft,
    postalCode: pick("postal_code"),
    streetNumber: pick("street_number"),
    street: pick("route"),
    zone: pick("sublocality_level_1"),
    sector: pick("administrative_area_level_2"),
    city: pick("locality"),
    province: pick("administrative_area_level_1"),
  };
}

/** `geometry.location` del resultado — lo que guarda el webapp como location. */
export function geocodeLocation(result: GeocodeResult | null | undefined): LatLng | null {
  const loc = result?.geometry?.location;
  return isLatLng(loc) ? { lat: loc.lat, lng: loc.lng } : null;
}

// ─── Guardado ────────────────────────────────────────────────────────────────

/**
 * handlerSelect de MapAddressSelector + addressSelectHandler de AdressEntity:
 * conserva lo que ya traía la dirección (deliveryRestrictions, personInCharge,
 * phone2…), pisa los campos del form y fija location/latitude/longitude.
 * `id: 1` es el que agrega AdressEntity al guardar.
 */
export function buildAddressToSave(
  previous: Address | null | undefined,
  draft: AddressDraft,
  location: LatLng,
): Address {
  return {
    ...(previous ?? {}),
    ...draft,
    location: { lat: location.lat, lng: location.lng },
    latitude: location.lat,
    longitude: location.lng,
    id: 1,
  };
}

/**
 * onFormattedAddressChange de AdressEntity: el textarea escribe directo en la
 * dirección guardada. Sin dirección previa crea `{ formattedAddress }` (o
 * nada si el texto queda vacío). Devuelve el valor de `form.address`: nunca
 * `[]`, siempre arreglo de 1 o null.
 */
export function applyFormattedAddressEdit(
  current: Address[] | null | undefined,
  text: string,
): Address[] | null {
  const previous = Array.isArray(current) && current.length > 0 ? current[0] : null;
  if (!previous) return text.trim() ? [{ formattedAddress: text }] : null;
  return [{ ...previous, formattedAddress: text }];
}

// ─── Red (Google) ────────────────────────────────────────────────────────────

/**
 * Key de Google Maps — mismo patrón que el webapp (hardcodeada en
 * Components/DraggableMap y Components/AddressInput), sin restricción. La
 * misma key va en app.json (`android.config.googleMaps.apiKey`) para el SDK
 * nativo de react-native-maps.
 */
export const GOOGLE_MAPS_API_KEY = "AIzaSyB9eh4EYxyjQhXXOXMQBFOC4e5Ryvmlwn8";

const MAPS_API = "https://maps.googleapis.com/maps/api";

export interface PlacePrediction {
  placeId: string;
  description: string;
}

/**
 * Places Autocomplete (Legacy), restringido a RD con components=country:do y
 * sin filtro de types (igual que AddressInput del webapp).
 */
export async function fetchPlacePredictions(
  input: string,
  apiKey: string = GOOGLE_MAPS_API_KEY,
): Promise<PlacePrediction[]> {
  const term = input.trim();
  if (!term) return [];
  const query = new URLSearchParams({ input: term, components: `country:${ADDRESS_COUNTRY}`, key: apiKey });
  const response = await fetch(`${MAPS_API}/place/autocomplete/json?${query.toString()}`);
  if (!response.ok) return [];
  const body = (await response.json()) as {
    status?: string;
    predictions?: { place_id?: string; description?: string }[];
  };
  if (body.status !== "OK" || !Array.isArray(body.predictions)) return [];
  return body.predictions
    .map((p) => ({ placeId: p.place_id ?? "", description: p.description ?? "" }))
    .filter((p) => p.placeId !== "" && p.description !== "");
}

/**
 * Geocoding API → results[0]. `language=es` y `region=do` son los
 * `setDefaults` de react-geocode en DraggableMap: sin eso los nombres de
 * provincia/ciudad pueden volver en inglés.
 */
async function geocode(params: Record<string, string>, apiKey: string): Promise<GeocodeResult | null> {
  const query = new URLSearchParams({ ...params, language: "es", region: ADDRESS_COUNTRY, key: apiKey });
  const response = await fetch(`${MAPS_API}/geocode/json?${query.toString()}`);
  if (!response.ok) return null;
  const body = (await response.json()) as { status?: string; results?: GeocodeResult[] };
  if (body.status !== "OK" || !Array.isArray(body.results) || body.results.length === 0) return null;
  return body.results[0];
}

/**
 * Sugerencia elegida → Geocoding por place_id. De esa MISMA respuesta salen
 * geometry.location y address_components (sin segundo reverse geocode).
 */
export async function geocodePlace(
  placeId: string,
  apiKey: string = GOOGLE_MAPS_API_KEY,
): Promise<GeocodeResult | null> {
  return geocode({ place_id: placeId }, apiKey);
}

/** Pin arrastrado o toque en el mapa — `geocode(RequestType.LATLNG, …)` de DraggableMap. */
export async function reverseGeocode(
  location: LatLng,
  apiKey: string = GOOGLE_MAPS_API_KEY,
): Promise<GeocodeResult | null> {
  return geocode({ latlng: `${location.lat},${location.lng}` }, apiKey);
}
