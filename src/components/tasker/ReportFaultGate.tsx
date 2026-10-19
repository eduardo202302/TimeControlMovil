import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { expoTaskerLocationApi } from "../../utils/locationApi";
import { requestReportLocation } from "../../utils/taskerLocation";
import {
  getReportGate,
  isTaskerEnabled,
  TASKER_NO_CLIENTS_MESSAGE,
  TASKER_NO_LOCATION_MESSAGE,
  TASKER_UNAVAILABLE_MESSAGE,
  type ReportLocationState,
} from "../../utils/taskerRules";
import ReportFaultForm from "./ReportFaultForm";
import TaskerBlockedState from "./TaskerBlockedState";

/**
 * Arranque de Reportar, con bloqueos estrictos y en este orden (getReportGate):
 * compañía no conectada → usuario sin clientes → buscando la posición → sin
 * posición → formulario. La posición se pide recién cuando las dos primeras
 * pasan.
 */
export default function ReportFaultGate() {
  const config = useSchoolStore((state) => state.taskerConfig);
  const clients = useSchoolStore((state) => state.taskerClients);
  const [location, setLocation] = useState<ReportLocationState>({ status: "pending" });

  // Cada búsqueda tiene su id: una respuesta vieja (o tras desmontar) no pisa la
  // actual. El AbortController corta la búsqueda en curso (y su suscripción).
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Se fue a los ajustes del sistema: al volver a la app se reintenta solo.
  const openedSettingsRef = useRef(false);

  /** Busca la posición; el estado solo cambia cuando llega la respuesta. */
  const locate = useCallback(() => {
    const id = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void requestReportLocation(expoTaskerLocationApi, { signal: controller.signal }).then(
      (result) => {
        if (id === requestRef.current) setLocation(result);
      },
    );
  }, []);

  /** Reintento: vuelve al indicador de carga y busca de nuevo. */
  const relocate = useCallback(() => {
    setLocation({ status: "pending" });
    locate();
  }, [locate]);

  // Arranca en "pending": la primera búsqueda no necesita marcarlo.
  const needsLocation = isTaskerEnabled(config) && clients.length > 0;
  useEffect(() => {
    if (needsLocation) locate();
    return () => {
      requestRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [needsLocation, locate]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && openedSettingsRef.current) {
        openedSettingsRef.current = false;
        relocate();
      }
    });
    return () => subscription.remove();
  }, [relocate]);

  const handleRetry = useCallback(() => {
    // Negado de forma permanente: el diálogo ya no sale, solo desde los ajustes.
    if (location.status === "failed" && !location.canAskAgain) {
      openedSettingsRef.current = true;
      Linking.openSettings().catch(() => {
        openedSettingsRef.current = false;
      });
      return;
    }
    relocate();
  }, [location, relocate]);

  const gate = getReportGate({ config, clients, location });

  switch (gate) {
    case "unavailable":
      return <TaskerBlockedState icon="ban-outline" tone="red" message={TASKER_UNAVAILABLE_MESSAGE} />;
    case "noClients":
      return <TaskerBlockedState icon="people-outline" message={TASKER_NO_CLIENTS_MESSAGE} />;
    case "locating":
      return <TaskerBlockedState loading message="Obteniendo su ubicación…" />;
    case "noLocation":
      return (
        <TaskerBlockedState
          icon="location-outline"
          message={TASKER_NO_LOCATION_MESSAGE}
          action={{ label: "Reintentar", icon: "refresh-outline", onPress: handleRetry }}
        />
      );
    case "ready":
      // getReportGate solo da "ready" con config conectada, clientes y posición.
      return location.status === "ok" && config ? (
        <ReportFaultForm config={config} clients={clients} coords={location.coords} />
      ) : null;
  }
}
