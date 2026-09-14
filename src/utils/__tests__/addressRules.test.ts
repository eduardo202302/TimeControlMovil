// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import {
  addressLocation,
  applyFormattedAddressEdit,
  applyGeocodeToDraft,
  buildAddressToSave,
  DEFAULT_MAP_CENTER,
  draftFromAddress,
  emptyAddressDraft,
  fetchPlacePredictions,
  formatAddress,
  geocodeLocation,
  geocodePlace,
  GOOGLE_MAPS_API_KEY,
  isAddressDraftComplete,
  reverseGeocode,
  type AddressDraft,
  type GeocodeResult,
} from "../addressRules";
import {
  buildCreateUserPayload,
  buildEmptyUserForm,
  buildPatchUserPayload,
  buildUserFormFromDetail,
  createDefaultScheduleRows,
  readCompanyUserSettings,
  type UserFormData,
} from "../userFormRules";


const GEOCODE: GeocodeResult = {
  formatted_address: "Av. Winston Churchill 25, Santo Domingo, República Dominicana",
  geometry: { location: { lat: 18.47, lng: -69.94 } },
  address_components: [
    { long_name: "25", types: ["street_number"] },
    { long_name: "Avenida Winston Churchill", types: ["route"] },
    { long_name: "Piantini", types: ["sublocality_level_1", "sublocality"] },
    { long_name: "Santo Domingo de Guzmán", types: ["locality", "political"] },
    { long_name: "Distrito Nacional", types: ["administrative_area_level_1"] },
  ],
};

function draft(overrides: Partial<AddressDraft> = {}): AddressDraft {
  return { ...emptyAddressDraft(), ...overrides };
}

const originalFetch = globalThis.fetch;
const mockedFetch = jest.fn();

beforeEach(() => {
  mockedFetch.mockReset();
  globalThis.fetch = mockedFetch as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("borrador", () => {
  it("draftFromAddress carga cada campo o '' y conserva el texto libre", () => {
    const d = draftFromAddress({ formattedAddress: "Calle Duarte #45, La Vega", phone: "8095551234" });
    expect(d.formattedAddress).toBe("Calle Duarte #45, La Vega");
    expect(d.phone).toBe("8095551234");
    expect(d.street).toBe("");
    expect(draftFromAddress(null)).toEqual(emptyAddressDraft());
  });

  it("addressLocation: location o latitude/longitude; null en la variante solo texto", () => {
    expect(addressLocation({ location: { lat: 1, lng: 2 } })).toEqual({ lat: 1, lng: 2 });
    expect(addressLocation({ latitude: 3, longitude: 4 })).toEqual({ lat: 3, lng: 4 });
    expect(addressLocation({ formattedAddress: "x", location: {} })).toBeNull();
  });

  it("requeridos: provincia, ciudad, sector, calle y número (sin coordenadas)", () => {
    const full = draft({ province: "P", city: "C", sector: "S", street: "Calle", streetNumber: "1" });
    expect(isAddressDraftComplete(full)).toBe(true);
    expect(isAddressDraftComplete({ ...full, sector: "  " })).toBe(false);
  });
});

describe("formatAddress (addressFormatter 1:1)", () => {
  it('"calle número, zona, sector, ciudad, provincia"', () => {
    expect(
      formatAddress(draft({ street: "Duarte", streetNumber: "45", zone: "Z", sector: "S", city: "La Vega", province: "La Vega" })),
    ).toBe("Duarte 45, Z, S, La Vega, La Vega");
    expect(formatAddress(draft({ street: "Duarte", city: "La Vega" }))).toBe("Duarte, La Vega");
  });
});

describe("reverse geocode → campos", () => {
  it("mapeo Google→campo; lo que Google no devuelve queda '' y no toca los manuales", () => {
    const next = applyGeocodeToDraft(
      draft({ title: "Casa", building: "Torre A", sector: "viejo", postalCode: "10101" }),
      GEOCODE,
    );
    expect(next).toMatchObject({
      streetNumber: "25",
      street: "Avenida Winston Churchill",
      zone: "Piantini",
      city: "Santo Domingo de Guzmán",
      province: "Distrito Nacional",
      sector: "",
      postalCode: "",
      title: "Casa",
      building: "Torre A",
    });
    expect(geocodeLocation(GEOCODE)).toEqual({ lat: 18.47, lng: -69.94 });
  });
});

describe("guardado de la dirección", () => {
  it("buildAddressToSave conserva claves previas, fija location/lat/lng e id 1", () => {
    const saved = buildAddressToSave(
      { personInCharge: "Ana", formattedAddress: "viejo" },
      draft({ street: "Duarte", formattedAddress: "nuevo" }),
      { ...DEFAULT_MAP_CENTER },
    );
    expect(saved).toMatchObject({
      personInCharge: "Ana",
      street: "Duarte",
      formattedAddress: "nuevo",
      location: { lat: 18.461174, lng: -69.941578 },
      latitude: 18.461174,
      longitude: -69.941578,
      id: 1,
    });
  });

  it("textarea: sin dirección crea {formattedAddress}; vacío → null (nunca [])", () => {
    expect(applyFormattedAddressEdit(null, "Calle 1")).toEqual([{ formattedAddress: "Calle 1" }]);
    expect(applyFormattedAddressEdit(null, "   ")).toBeNull();
    expect(applyFormattedAddressEdit([], "")).toBeNull();
    expect(applyFormattedAddressEdit([{ city: "X", formattedAddress: "a" }], "")).toEqual([
      { city: "X", formattedAddress: "" },
    ]);
  });
});

describe("payload con el shape completo de dirección", () => {
  const COMPANY = readCompanyUserSettings({});
  const common = {
    roles: [],
    canApplySchedule: false,
    initialSchedules: createDefaultScheduleRows(),
    schedules: createDefaultScheduleRows(),
  };
  const fullAddress = buildAddressToSave(
    null,
    draft({ province: "P", city: "C", sector: "S", street: "Calle", streetNumber: "1", formattedAddress: "Calle 1, S, C, P" }),
    { lat: 18.5, lng: -69.9 },
  );

  it("borrar la dirección en edit manda address: null", () => {
    const initialForm = buildUserFormFromDetail({ id: 1, address: [fullAddress] }, COMPANY);
    const form: UserFormData = { ...initialForm, address: null };
    const payload = buildPatchUserPayload({ ...common, initialForm, form });
    expect((payload.schoolUser as Record<string, unknown>).address).toBeNull();
  });

  it("sin cambios en la dirección no se manda; con cambios va el arreglo completo", () => {
    const initialForm = buildUserFormFromDetail({ id: 1, address: [fullAddress] }, COMPANY);
    expect(buildPatchUserPayload({ ...common, initialForm, form: initialForm }).schoolUser).not.toHaveProperty(
      "address",
    );
    const edited: UserFormData = { ...initialForm, address: [{ ...fullAddress, building: "Torre A" }] };
    expect((buildPatchUserPayload({ ...common, initialForm, form: edited }).schoolUser as Record<string, unknown>).address).toEqual([
      { ...fullAddress, building: "Torre A" },
    ]);
  });

  it("add: address null si no hay dirección, arreglo de 1 si la hay; [] del backend se siembra como null", () => {
    const empty = buildEmptyUserForm(COMPANY);
    expect((buildCreateUserPayload({ ...common, form: empty }).schoolUser as Record<string, unknown>).address).toBeNull();
    expect(
      (buildCreateUserPayload({ ...common, form: { ...empty, address: [fullAddress] } }).schoolUser as Record<string, unknown>)
        .address,
    ).toEqual([fullAddress]);
    expect(buildUserFormFromDetail({ id: 1, address: [] }, COMPANY).address).toBeNull();
  });
});

describe("red (Google)", () => {
  const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });

  it("autocomplete Legacy: components=country:do, sin types, mapea description", async () => {
    mockedFetch.mockReturnValue(
      json({
        status: "OK",
        predictions: [{ place_id: "p1", description: "Av. Winston Churchill, Santo Domingo" }, { place_id: "" }],
      }),
    );
    expect(await fetchPlacePredictions("church")).toEqual([
      { placeId: "p1", description: "Av. Winston Churchill, Santo Domingo" },
    ]);
    const url = new URL(mockedFetch.mock.calls[0][0] as string);
    expect(`${url.origin}${url.pathname}`).toBe("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    expect(url.searchParams.get("input")).toBe("church");
    expect(url.searchParams.get("components")).toBe("country:do");
    expect(url.searchParams.get("key")).toBe(GOOGLE_MAPS_API_KEY);
    expect(url.searchParams.has("types")).toBe(false);

    mockedFetch.mockReturnValueOnce(json({ status: "ZERO_RESULTS", predictions: [] }));
    expect(await fetchPlacePredictions("zzzz")).toEqual([]);
    expect(await fetchPlacePredictions("  ")).toEqual([]);
  });

  it("sugerencia → geocode por place_id: location y campos salen de la misma respuesta", async () => {
    mockedFetch.mockReturnValueOnce(json({ status: "OK", results: [GEOCODE] }));
    const result = await geocodePlace("p1");
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const url = new URL(mockedFetch.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/maps/api/geocode/json");
    expect(url.searchParams.get("place_id")).toBe("p1");
    expect(geocodeLocation(result)).toEqual({ lat: 18.47, lng: -69.94 });
    expect(applyGeocodeToDraft(emptyAddressDraft(), result as GeocodeResult).street).toBe(
      "Avenida Winston Churchill",
    );
  });

  it("pin/toque → reverse geocode por latlng; sin resultados → null", async () => {
    mockedFetch.mockReturnValueOnce(json({ status: "OK", results: [GEOCODE] }));
    expect(await reverseGeocode({ lat: 18.4, lng: -69.9 })).toBe(GEOCODE);
    const url = new URL(mockedFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get("latlng")).toBe("18.4,-69.9");
    expect(url.searchParams.get("key")).toBe(GOOGLE_MAPS_API_KEY);

    mockedFetch.mockReturnValueOnce(json({ status: "ZERO_RESULTS", results: [] }));
    expect(await reverseGeocode({ lat: 0, lng: 0 })).toBeNull();
  });
});
