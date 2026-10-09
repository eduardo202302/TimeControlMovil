import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React from "react";
import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { PRIMARY_700 } from "@/constants/colors";
import {
  buildMapsUrl,
  getAddressFields,
  type AddressField,
} from "../../utils/taskerRules";
import type { TaskerAddress } from "../../../types/typesTasker/TaskerTypes";
import { FollowUpCardHeader } from "./FollowUpParts";
import type { FollowUpStyles } from "./followUpStyles";

/**
 * Textos largos: van a lo ancho, apilados al final junto a "Ver en mapa"
 * (como en el mockup). El resto, en dos columnas.
 */
const LONG_KEYS = new Set<AddressField["key"]>([
  "referenceToArrive",
  "whoReceives",
  "restrictions",
]);

interface FollowUpAddressTabProps {
  address: TaskerAddress | null;
  styles: FollowUpStyles;
}

export default function FollowUpAddressTab({ address, styles }: FollowUpAddressTabProps) {
  if (!address) return null;

  const fields = getAddressFields(address);
  const titleField = fields.find((f) => f.key === "title");
  const gridFields = fields.filter((f) => f.key !== "title" && !LONG_KEYS.has(f.key));
  const longFields = fields.filter((f) => LONG_KEYS.has(f.key));
  const hasCoords =
    fields.some((f) => f.key === "latitude") && fields.some((f) => f.key === "longitude");

  const openMap = () => {
    Linking.openURL(buildMapsUrl(address.latitude!, address.longitude!)).catch(
      () => undefined,
    );
  };

  return (
    <View style={styles.card}>
      <FollowUpCardHeader styles={styles} tone="teal" icon="location-outline" title="Dirección (1)" />
      <View style={styles.addressGrid}>
        {titleField && <Field field={titleField} styles={styles} cellStyle={styles.addressCellFull} />}
        {gridFields.map((field) => (
          <Field key={field.key} field={field} styles={styles} cellStyle={styles.addressCellHalf} />
        ))}
        {(longFields.length > 0 || hasCoords) && (
          <View style={styles.addressTail}>
            <View style={styles.addressTailFields}>
              {longFields.map((field) => (
                <Field key={field.key} field={field} styles={styles} />
              ))}
            </View>
            {hasCoords && (
              <TouchableOpacity style={styles.mapBtn} onPress={openMap} activeOpacity={0.75}>
                <Ionicons name="map-outline" size={16} color={PRIMARY_700} />
                <Text style={styles.mapBtnText}>Ver en mapa</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

interface FieldProps {
  field: AddressField;
  styles: FollowUpStyles;
  cellStyle?: StyleProp<ViewStyle>;
}

function Field({ field, styles, cellStyle }: FieldProps) {
  return (
    <View style={cellStyle}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <Text style={styles.fieldValue}>{field.value}</Text>
    </View>
  );
}
