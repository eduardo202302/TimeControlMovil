import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback } from "react";
import FollowUpView from "../../components/tasker/FollowUpView";
import TaskerBlockedState from "../../components/tasker/TaskerBlockedState";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { isTaskerEnabled, TASKER_UNAVAILABLE_MESSAGE } from "../../utils/taskerRules";
import {
  FOLLOWUP_TICKET_PARAM,
  parseFollowUpTicketParam,
} from "../../utils/taskerFollowUpRules";

export default function FollowUpScreen() {
  // Sin Tasker conectado no se muestra la vista (aunque se llegue por la ruta).
  const enabled = useSchoolStore((state) => isTaskerEnabled(state.taskerConfig));
  // ?ticket=<id> desde "Ver seguimiento" (Reportar).
  const params = useLocalSearchParams<{ [FOLLOWUP_TICKET_PARAM]?: string | string[] }>();
  const requestedTicketId = parseFollowUpTicketParam(params[FOLLOWUP_TICKET_PARAM]);
  // Se borra de la ruta al tomarlo: volver a la pantalla no lo reaplica.
  const consumeTicketParam = useCallback(() => {
    router.setParams({ [FOLLOWUP_TICKET_PARAM]: undefined });
  }, []);

  if (!enabled) {
    return <TaskerBlockedState icon="ban-outline" tone="red" message={TASKER_UNAVAILABLE_MESSAGE} />;
  }
  return (
    <FollowUpView
      requestedTicketId={requestedTicketId}
      onRequestConsumed={consumeTicketParam}
    />
  );
}
