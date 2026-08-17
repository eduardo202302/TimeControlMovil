import axios from "axios";
import * as Storage from "../src/utils/storage";
import { useSchoolStore } from "../store/useSchoolStore";
import { ClaveRegistroType } from "../types/typesAuthorization/claveRegistroType";
import { buscarEmpresaPorPin } from "../utils/metodos";

const api = axios.create({
  headers: { "Content-Type": "application/json" },
});

const authorization = async (data: ClaveRegistroType) => {
  const { claveRegistro } = data;
  try {
    const response = await buscarEmpresaPorPin(claveRegistro);

    if (!response) throw new Error("Error en la solicitud de autorización.");

    const peticion = await api.get(
      `${response.url}/schools/pin/${claveRegistro}`,
    );

    if (!peticion) throw new Error("Error en la solicitud de autorización.");

    const { success, data: responseData, message } = peticion.data;

    if (success) {
      await Storage.setItemAsync(
        "dataSchool",
        JSON.stringify(responseData),
      );
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

export { authorization };

