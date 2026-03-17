import axios from "axios";
import * as SecureStore from "expo-secure-store";
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
      await SecureStore.setItemAsync(
        "dataSchool",
        JSON.stringify(responseData),
      );
      await SecureStore.setItemAsync("claveRegistro", claveRegistro);
      await SecureStore.setItemAsync("urlColegio", response.url);
      await SecureStore.setItemAsync("isAuthorized", "true");

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

