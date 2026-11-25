import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { expoTaskerLocationApi, isDevEmulator } from "../../utils/locationApi";
import { checkOpenJornadaToday, REPORT_JORNADA_TIMEOUT_MS } from "../../utils/reportJornada";
import { PUNCHINOUT_PATH, userRequiresJornadaForReport } from "../../utils/reportJornadaRules";
import { requestReportLocation } from "../../utils/taskerLocation";
import {
  getJornadaOnVisit,
  getLocationOnVisit,
  getReportGate,
  isJornadaReadyForReport,
  isTaskerEnabled,
  TASKER_GO_TO_PUNCH_LABEL,
  TASKER_JORNADA_ERROR_MESSAGE,
  TASKER_NO_CLIENTS_MESSAGE,
  TASKER_NO_JORNADA_MESSAGE,
  TASKER_NO_LOCATION_MESSAGE,
  TASKER_UNAVAILABLE_MESSAGE,
  type ReportJornadaState,
  type ReportLocationState,
} from "../../utils/taskerRules";
import ReportFaultForm from "./ReportFaultForm";
import TaskerBlockedState from "./TaskerBlockedState";

/**
 * Arranque de Reportar, con bloqueos estrictos y en este orden (getReportGate):
 * compañía no conectada → usuario sin clientes → jornada abierta hoy (si la
 * regla aplica: Tasker + ponchador en el menú) → buscando la posición → sin
 * posición → formulario. La jornada se consulta (GET /punches/today) en cada
 * entrada; la posición se pide recién cuando todo lo anterior pasa, y NUEVA
 * en cada entrada a la pantalla y con cada sesión nueva (volver a iniciar
 * sesión o cambiar de empresa). Al salir se descarta: nunca pasa de una
 * visita a otra.
 */
export default function ReportFaultGate() {
  const config = useSchoolStore((state) => state.taskerConfig);
  const clients = useSchoolStore((state) => state.taskerClients);
  const allowedMenuItems = useSchoolStore((state) => state.allowedMenuItems);
  const jornadaRequired = userRequiresJornadaForReport(allowedMenuItems, config);
  const [location, setLocation] = useState<ReportLocationState>({ status: "pending" });
  const [jornada, setJornada] = useState<ReportJornadaState>(() =>
    getJornadaOnVisit({ status: "checking" }, jornadaRequired),
  );
  // Igual que la posición: una respuesta vieja (o tras salir) no pisa la actual.
  const jornadaRequestRef = useRef(0);

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
    void requestReportLocation(expoTaskerLocationApi, {
      signal: controller.signal,
      acceptStaleLastKnown: isDevEmulator,
    }).then((result) => {
      if (id === requestRef.current) setLocation(result);
    });
  }, []);

  /** Reintento: vuelve al indicador de carga y busca de nuevo. */
  const relocate = useCallback(() => {
    setLocation({ status: "pending" });
    locate();
  }, [locate]);

  /** Consulta la jornada; el estado solo cambia cuando llega la respuesta. */
  const checkJornada = useCallback(() => {
    const id = ++jornadaRequestRef.current;
    void checkOpenJornadaToday(REPORT_JORNADA_TIMEOUT_MS).then((result) => {
      if (id !== jornadaRequestRef.current) return;
      if (!result.ok) setJornada({ status: "failed" });
      else setJornada({ status: result.open ? "open" : "closed" });
    });
  }, []);

  /** Reintento tras un fallo de red: vuelve al indicador y consulta de nuevo. */
  const retryJornada = useCallback(() => {
    setJornada({ status: "checking" });
    checkJornada();
  }, [checkJornada]);

  // Sesión nueva (volver a iniciar sesión o cambiar de empresa): formulario
  // nuevo (otra `key`) y a esperar la posición desde cero. La búsqueda la
  // relanza el efecto de foco, que también depende de config y clientes.
  const [sessionKey, setSessionKey] = useState(0);
  const sessionRef = useRef({ config, clients });
  useEffect(() => {
    if (sessionRef.current.config === config && sessionRef.current.clients === clients) return;
    sessionRef.current = { config, clients };
    setSessionKey((key) => key + 1);
    setLocation({ status: "pending" });
    // La jornada también desde cero (sin "rechecking": el formulario es otro).
    setJornada({ status: "checking" });
  }, [config, clients]);

  // Cada entrada a Reportar consulta la jornada (si la regla aplica). Al salir
  // se corta la consulta y queda marcada para volver a consultarse: tras un
  // "open" pasa a rechecking, así el formulario abierto no se desmonta mientras
  // llega la nueva respuesta y la posición no se pide hasta confirmarla.
  const jornadaApplies = jornadaRequired && isTaskerEnabled(config) && clients.length > 0;
  useFocusEffect(
    useCallback(() => {
      setJornada((prev) => getJornadaOnVisit(prev, jornadaRequired));
      if (jornadaApplies) checkJornada();
      return () => {
        jornadaRequestRef.current += 1;
        setJornada((prev) => getJornadaOnVisit(prev, jornadaRequired));
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- config y clients: una sesión nueva con la pantalla abierta también consulta
    }, [jornadaRequired, jornadaApplies, checkJornada, config, clients]),
  );

  // Cada entrada a Reportar pide una posición nueva; al salir se corta la
  // búsqueda y se descarta la posición (con el formulario abierto, este sigue
  // y espera la nueva: ver getLocationOnVisit).
  // Sin jornada confirmada (regla aplicada) no se pide el GPS.
  const needsLocation =
    isTaskerEnabled(config) && clients.length > 0 && isJornadaReadyForReport(jornada);
  useFocusEffect(
    useCallback(() => {
      if (!needsLocation) return undefined;
      setLocation(getLocationOnVisit);
      locate();
      return () => {
        requestRef.current += 1;
        abortRef.current?.abort();
        abortRef.current = null;
        setLocation(getLocationOnVisit);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- config y clients: una sesión nueva con la pantalla abierta también busca
    }, [needsLocation, locate, config, clients]),
  );

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

  const gate = getReportGate({ config, clients, jornada, location });

  switch (gate) {
    case "unavailable":
      return <TaskerBlockedState icon="ban-outline" tone="red" message={TASKER_UNAVAILABLE_MESSAGE} />;
    case "noClients":
      return <TaskerBlockedState icon="people-outline" message={TASKER_NO_CLIENTS_MESSAGE} />;
    case "checkingJornada":
      return <TaskerBlockedState loading message="Verificando tu jornada…" />;
    case "noJornada":
      return (
        <TaskerBlockedState
          icon="time-outline"
          message={TASKER_NO_JORNADA_MESSAGE}
          action={{
            label: TASKER_GO_TO_PUNCH_LABEL,
            icon: "finger-print-outline",
            // Igual que navegar desde el menú (DrawerMenu.handleNavigate).
            onPress: () => router.push(PUNCHINOUT_PATH as never),
          }}
        />
      );
    case "jornadaError":
      return (
        <TaskerBlockedState
          icon="cloud-offline-outline"
          tone="red"
          message={TASKER_JORNADA_ERROR_MESSAGE}
          action={{ label: "Reintentar", icon: "refresh-outline", onPress: retryJornada }}
        />
      );
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
      // getReportGate solo da "ready" con config conectada, clientes y posición
      // (o refrescándola con el formulario abierto: sin coords hasta que llegue).
      return config ? (
        <ReportFaultForm
          key={sessionKey}
          config={config}
          clients={clients}
          coords={location.status === "ok" ? location.coords : null}
        />
      ) : null;
  }
}
