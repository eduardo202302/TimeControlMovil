import axios from "axios";
import * as Storage from "../src/utils/storage";
import { useSchoolStore } from "../store/useSchoolStore";
import { ClaveRegistroType } from "../types/typesAuthorization/claveRegistroType";
import { School } from "../types/typeStore/SchoolStoreType";
import { buscarEmpresaPorPin } from "../utils/metodos";

const api = axios.create({
  headers: { "Content-Type": "application/json" },
});

/**
 * Re-consulta la data de la escuela autorizada (por clave de registro) y
 * actualiza el store + Storage. Llamado al entrar a la app para traer la
 * información más reciente del colegio cada vez que se inicia.
 */
const refreshSchoolData = async () => {
  try {
    const claveRegistro = await Storage.getItemAsync("claveRegistro");
    const urlColegio = await Storage.getItemAsync("urlColegio");
    if (!claveRegistro || !urlColegio) return null;

    const peticion = await api.get<{
      success: boolean;
      data: School;
    }>(`${urlColegio}/schools/pin/${claveRegistro}`);

    const { success, data: responseData } = peticion.data;
    if (success && responseData) {
      await Storage.setItemAsync("dataSchool", JSON.stringify(responseData));
      useSchoolStore.getState().setSchool(responseData);
      useSchoolStore.getState().setUrlColegio(urlColegio);
      return responseData;
    }
    return null;
  } catch (error) {
    console.error("Error al refrescar data de escuela:", error);
    return null;
  }
};

const authorization = async (data: ClaveRegistroType) => {
  const { claveRegistro } = data;
  try {
    const response = await buscarEmpresaPorPin(claveRegistro);

    if (!response) throw new Error("Error en la solicitud de autorización.");

    const peticion = await api.get(
      `${response.url}/schools/pin/${claveRegistro}`,
    );

    if (!peticion) throw new Error("Error en la solicitud de autorización.");

    const { success, data: responseData } = peticion.data;

    if (success) {
      await Storage.setItemAsync("dataSchool", JSON.stringify(responseData));
      await Storage.setItemAsync("claveRegistro", claveRegistro);
      await Storage.setItemAsync("urlColegio", response.url);
      await Storage.setItemAsync("isAuthorized", "true");

      useSchoolStore.getState().setSchool(responseData);
      useSchoolStore.getState().setUrlColegio(response.url);
    }

    return peticion;
  } catch (error) {
    console.error("Error en la autorización:", error);
    return {
      success: false,
      data: null,
      message: "Error de conexión. Verifica tu red.",
    };
  }
};

export { authorization, refreshSchoolData };

