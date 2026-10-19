import React from "react";
import FollowUpView from "../../components/tasker/FollowUpView";
import TaskerBlockedState from "../../components/tasker/TaskerBlockedState";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { isTaskerEnabled, TASKER_UNAVAILABLE_MESSAGE } from "../../utils/taskerRules";

export default function FollowUpScreen() {
  // Sin Tasker conectado no se muestra la vista (aunque se llegue por la ruta).
  const enabled = useSchoolStore((state) => isTaskerEnabled(state.taskerConfig));
  if (!enabled) {
    return <TaskerBlockedState icon="ban-outline" tone="red" message={TASKER_UNAVAILABLE_MESSAGE} />;
  }
  return <FollowUpView />;
}
