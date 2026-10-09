import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { PRIMARY_700 } from "@/constants/colors";
import {
  buildMapsUrl,
  formatActivityRange,
  getActivityTime,
} from "../../utils/taskerRules";
import type { TaskerActivity } from "../../../types/typesTasker/TaskerTypes";
import { FollowUpCardHeader } from "./FollowUpParts";
import type { FollowUpStyles } from "./followUpStyles";

interface FollowUpActionsTabProps {
  /** Ya filtradas por getStateActivities (solo estados, id descendente). */
  activities: TaskerActivity[];
  /** Estado actual del ticket. */
  stateId: number;
  /** "Ahora" fijado al montar la pantalla. */
  nowMs: number;
  styles: FollowUpStyles;
}

export default function FollowUpActionsTab({
  activities,
  stateId,
  nowMs,
  styles,
}: FollowUpActionsTabProps) {
  return (
    <View style={styles.card}>
      <FollowUpCardHeader
        styles={styles}
        tone="sky"
        icon="time-outline"
        title={`Historial de Acciones - ${activities.length}`}
      />
      <View>
        {activities.map((activity, index) => {
          const time = getActivityTime(activity, stateId, nowMs);
          const isLast = index === activities.length - 1;
          return index === 0 ? (
            <CurrentRow
              key={activity.id}
              activity={activity}
              time={time}
              isLast={isLast}
              styles={styles}
            />
          ) : (
            <PastRow
              key={activity.id}
              activity={activity}
              time={time}
              isLast={isLast}
              styles={styles}
            />
          );
        })}
      </View>
    </View>
  );
}

interface RowProps {
  activity: TaskerActivity;
  time: string | null;
  isLast: boolean;
  styles: FollowUpStyles;
}

/** Estado actual: tarjeta destacada con nodo grande. */
function CurrentRow({ activity, time, isLast, styles }: RowProps) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.rail}>
        <View style={styles.nodeCurrent}>
          <View style={styles.nodeCurrentDot} />
        </View>
        {!isLast && <View style={[styles.railLine, styles.railLineCurrent]} />}
      </View>
      <View style={styles.currentCard}>
        <View style={styles.currentBadge}>
          <Text style={styles.currentBadgeText}>Estado actual</Text>
        </View>
        <Text style={styles.currentTitle}>
          {activity.action}
          {!!activity.message && (
            <Text style={styles.currentMessage}> {activity.message}</Text>
          )}
        </Text>
        <Text style={styles.currentRange}>{formatActivityRange(activity)}</Text>
        <View style={[styles.metaRow, styles.currentMetaRow]}>
          <Text style={styles.currentBy}>
            Por: <Text style={styles.currentByName}>{activity.user.name}</Text>
          </Text>
          {time != null && (
            <View style={styles.currentTime}>
              <Text style={styles.currentTimeText}>{time}</Text>
            </View>
          )}
        </View>
        <Coordinates activity={activity} styles={styles} />
      </View>
    </View>
  );
}

/** Estados anteriores: atenuados sobre la línea de tiempo. */
function PastRow({ activity, time, isLast, styles }: RowProps) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.rail}>
        <View style={styles.node} />
        {!isLast && <View style={styles.railLine} />}
      </View>
      <View style={[styles.pastBody, !isLast && styles.pastBodySpaced]}>
        <Text style={styles.pastTitle}>
          <Text style={styles.pastAction}>{activity.action}</Text>
          {activity.message ? ` ${activity.message}` : ""}
        </Text>
        <Text style={styles.pastRange}>{formatActivityRange(activity)}</Text>
        <View style={[styles.metaRow, styles.pastMetaRow]}>
          <Text style={styles.pastBy}>
            Por: <Text style={styles.pastByName}>{activity.user.name}</Text>
          </Text>
          {time != null && <Text style={styles.pastTime}>{time}</Text>}
        </View>
        <Coordinates activity={activity} styles={styles} past />
      </View>
    </View>
  );
}

function Coordinates({
  activity,
  styles,
  past = false,
}: {
  activity: TaskerActivity;
  styles: FollowUpStyles;
  past?: boolean;
}) {
  const coords = activity.coordinates;
  if (!coords) return null;
  return (
    <View style={[styles.metaRow, styles.coordsRow, past && styles.coordsRowPast]}>
      <Text style={styles.coordsText}>
        {coords.latitude}, {coords.longitude}
      </Text>
      <TouchableOpacity
        style={styles.smallMapBtn}
        onPress={() =>
          Linking.openURL(buildMapsUrl(coords.latitude, coords.longitude)).catch(
            () => undefined,
          )
        }
        activeOpacity={0.75}
      >
        <Ionicons name="map-outline" size={16} color={PRIMARY_700} />
        <Text style={styles.smallMapBtnText}>Ver en mapa</Text>
      </TouchableOpacity>
    </View>
  );
}
