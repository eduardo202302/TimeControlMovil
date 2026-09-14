import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Switch,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import TagOptionSheet from "../permissions/TagOptionSheet";
import type { PermissionCatalogTag } from "../../utils/adminPermissionRules";
import {
  latenessRecordDate,
  latenessTypeLabel,
  maskCedula,
  maskPhone,
  recordDate,
  type UserFormErrorKey,
} from "../../utils/userFormRules";
import { pickUserPhoto, type UserPhotoSource } from "./pickUserPhoto";
import type { UserFormController, UserTextField } from "./useUserForm";
import type { UserFormStyles } from "./userFormStyles";

/**
 * Copia deliberada de PHOTO_HOST/photoUri() de adminpunchinout.tsx (mismo
 * criterio que AdminPermissionCreateModal.tsx): el backend guarda la foto
 * como ruta relativa ("school_1/users/…"). Una foto recién tomada ya es un
 * data-URL y se muestra tal cual.
 */
const PHOTO_HOST = "https://timecontrol.wsmax.net:8600";

function photoUri(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.startsWith("http") || raw.startsWith("file:")) return raw;
  return `${PHOTO_HOST}/${raw}`;
}

interface UserBasicInfoTabProps {
  ctl: UserFormController;
  styles: UserFormStyles;
}

/** Tab "Info. básica" — port de SubComponents/UserBasicInfo + LastAbcencesAndTardiness. */
export default function UserBasicInfoTab({ ctl, styles }: UserBasicInfoTabProps) {
  const { form, errors, isWatch, mode, company, roles } = ctl;
  const [rolesVisible, setRolesVisible] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const roleOptions = useMemo<PermissionCatalogTag[]>(
    () => roles.map((role) => ({ id: role.id, name: role.name })),
    [roles],
  );
  const roleName = roles.find((role) => role.id === form.role)?.name;

  const takePhoto = useCallback(
    async (source: UserPhotoSource) => {
      setPhotoBusy(true);
      const result = await pickUserPhoto(source);
      setPhotoBusy(false);
      if (result.status === "ok") ctl.setPhoto(result.dataUrl);
      else if (result.status === "denied") {
        Alert.alert(
          "Permiso requerido",
          source === "camera"
            ? "Necesitas permitir el acceso a la cámara para tomar la foto."
            : "Necesitas permitir el acceso a la galería para adjuntar la foto.",
        );
      } else if (result.status === "error") {
        Alert.alert("Error de Imagen", "No se pudo procesar la imagen.");
      }
    },
    [ctl],
  );

  const renderInput = (
    label: string,
    field: UserTextField,
    options: {
      required?: boolean;
      errorKey?: UserFormErrorKey;
      display?: (value: string) => string;
      transform?: (value: string) => string;
      inputProps?: TextInputProps;
    } = {},
  ) => {
    const error = options.errorKey ? errors[options.errorKey] : undefined;
    const value = form[field];
    return (
      <View key={field} style={styles.labelSpaced}>
        <Text style={styles.label}>
          {label} {options.required && <Text style={styles.required}>*</Text>}
        </Text>
        <TextInput
          style={[styles.input, isWatch && styles.inputDisabled, !!error && styles.inputInvalid]}
          value={options.display ? options.display(value) : value}
          onChangeText={(text) =>
            ctl.setField(field, options.transform ? options.transform(text) : text)
          }
          editable={!isWatch}
          placeholderTextColor="#9CA3AF"
          autoCorrect={false}
          {...options.inputProps}
        />
        {!!error && <Text style={styles.fieldError}>{error}</Text>}
      </View>
    );
  };

  const cedulaField = renderInput("Cédula", "cedula", {
    errorKey: "cedula",
    display: maskCedula,
    transform: maskCedula,
    inputProps: { placeholder: "Ej. 001-0000000-0", keyboardType: "number-pad" },
  });
  const emailField = renderInput("Correo", "email", {
    required: true,
    errorKey: "email",
    inputProps: {
      placeholder: "Ej. juan@mail.com",
      keyboardType: "email-address",
      autoCapitalize: "none",
    },
  });
  const phoneField = renderInput("Whatsapp", "phone", {
    required: true,
    errorKey: "phone",
    display: maskPhone,
    transform: maskPhone,
    inputProps: { placeholder: "Ej. 809 555 1234", keyboardType: "phone-pad" },
  });
  const waIdField = renderInput("Referencia Ws", "waId", {
    inputProps: { placeholder: "Ej. 1234567890", autoCapitalize: "none" },
  });
  const roleField = (
    <View key="role" style={styles.labelSpaced}>
      <Text style={styles.label}>
        Rol <Text style={styles.required}>*</Text>
      </Text>
      <TouchableOpacity
        style={[styles.select, isWatch && styles.inputDisabled, !!errors.role && styles.inputInvalid]}
        onPress={() => setRolesVisible(true)}
        disabled={isWatch}
        activeOpacity={0.75}
      >
        <Ionicons name="shield-checkmark-outline" size={16} color="#2563EB" />
        <Text style={roleName ? styles.selectValue : styles.selectPlaceholder} numberOfLines={1}>
          {roleName ?? "Selecciona un rol"}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
      </TouchableOpacity>
      {!!errors.role && <Text style={styles.fieldError}>{errors.role}</Text>}
    </View>
  );

  // Orden del webapp: con cédula → [Cédula, Correo, Whatsapp, Rol, Ref. Ws];
  // sin cédula → [Correo, Rol, Whatsapp, Ref. Ws] (la cédula no se renderiza).
  const dynamicFields = company.companyCedula
    ? [cedulaField, emailField, phoneField, roleField, waIdField]
    : [emailField, roleField, phoneField, waIdField];

  const photo = photoUri(form.photourl[0]);
  const photoMissing = ctl.isUserImageRequired && !photo;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="person-outline" size={16} color="#2563EB" />
            <Text style={styles.cardTitle}>Info. básica</Text>
          </View>
          <View style={styles.inlineRow}>
            <Text style={styles.switchValue}>{form.isActive ? "Activo: Sí" : "Activo: No"}</Text>
            <Switch value={form.isActive} onValueChange={ctl.setActive} disabled={isWatch} />
          </View>
        </View>

        {/* ── Foto ── */}
        <View style={styles.photoRow}>
          <View style={[styles.photoBox, (photoMissing && !!errors.image) && styles.photoBoxInvalid]}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photoImage} resizeMode="cover" />
            ) : (
              <Ionicons name="person" size={44} color="#9CA3AF" />
            )}
          </View>
          <View style={styles.photoActions}>
            {photoMissing && <Text style={styles.photoRequired}>Foto (Requerida)</Text>}
            {!isWatch &&
              (photoBusy ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <>
                  <View style={styles.inlineRow}>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.flex]}
                      onPress={() => takePhoto("camera")}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="camera-outline" size={16} color="#2563EB" />
                      <Text style={styles.smallBtnText}>Foto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.flex]}
                      onPress={() => takePhoto("gallery")}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="image-outline" size={16} color="#2563EB" />
                      <Text style={styles.smallBtnText}>Adjun.</Text>
                    </TouchableOpacity>
                  </View>
                  {!!photo && (
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => ctl.setPhoto(null)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={16} color="#B43333" />
                      <Text style={[styles.smallBtnText, styles.smallBtnDangerText]}>Quitar</Text>
                    </TouchableOpacity>
                  )}
                </>
              ))}
          </View>
        </View>

        {/* ── Código / Pin ── */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            {renderInput("Código", "code", { inputProps: { placeholder: "Ej. 12345" } })}
          </View>
          <View style={styles.rowItem}>
            <View style={styles.labelSpaced}>
              <Text style={styles.label}>Pin</Text>
              <View style={styles.inlineRow}>
                <TextInput
                  style={[styles.input, styles.flex, isWatch && styles.inputDisabled]}
                  value={form.pin}
                  onChangeText={(text) => ctl.setField("pin", text)}
                  editable={!isWatch}
                  keyboardType="number-pad"
                  placeholderTextColor="#9CA3AF"
                />
                {!isWatch && (
                  <TouchableOpacity
                    style={[styles.smallBtn, ctl.pinLoading && styles.smallBtnDisabled]}
                    onPress={ctl.generatePin}
                    disabled={ctl.pinLoading}
                    activeOpacity={0.8}
                    accessibilityLabel="Generar pin"
                  >
                    {ctl.pinLoading ? (
                      <ActivityIndicator size="small" color="#2563EB" />
                    ) : (
                      <Text style={styles.smallBtnText}>Generar</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>

        {renderInput("Nombre Completo", "fullName", {
          required: true,
          errorKey: "fullName",
          inputProps: { placeholder: "Ej. Juan Pérez", autoCapitalize: "words" },
        })}
        {renderInput("Usuario", "nickName", {
          inputProps: { placeholder: "Ej. jperez", autoCapitalize: "none" },
        })}

        {dynamicFields}

        {/* Contraseña: solo en add — en edit/watch no existe el campo. */}
        {mode === "add" &&
          renderInput("Contraseña", "password", {
            required: true,
            errorKey: "password",
            inputProps: {
              placeholder: "Ej. 1234",
              secureTextEntry: true,
              autoCapitalize: "none",
              textContentType: "newPassword",
            },
          })}
      </View>

      {company.companyIsTimeControlDefault && ctl.mode !== "add" && ctl.detail && (
        <LastRecordsCard ctl={ctl} styles={styles} />
      )}

      <TagOptionSheet
        visible={rolesVisible}
        title="Rol"
        options={roleOptions}
        selectedId={form.role === "" ? null : form.role}
        emptyText="No hay roles disponibles."
        onSelect={(tag) => {
          ctl.setRole(typeof tag.id === "number" ? tag.id : "");
          setRolesVisible(false);
        }}
        onClose={() => setRolesVisible(false)}
      />
    </>
  );
}

/**
 * "Ult. Registros": última Ausencia y última Tardanza de GET /users/:id, con
 * el mismo filtro de overtime en cero que LastAbcencesAndTardiness:36-42. Sin
 * "ver todas" (allAbsences/allLateness no existen en el backend).
 */
function LastRecordsCard({ ctl, styles }: UserBasicInfoTabProps) {
  const absence = ctl.detail?.userAbsence;
  const lateness = ctl.detail?.userLateness;
  const absenceDate = recordDate(absence);
  // Oculta la tardanza con overtime en cero — hasDataLateness del webapp.
  const latenessDate = latenessRecordDate(lateness);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="time-outline" size={16} color="#2563EB" />
          <Text style={styles.cardTitle}>Ult. Registros</Text>
        </View>
      </View>

      <View style={styles.recordSection}>
        <Text style={styles.recordTitle}>
          Ausencia -{" "}
          {absenceDate ?? <Text style={styles.recordEmpty}>sin registro</Text>}
        </Text>
        {absenceDate && (
          <View style={styles.recordRow}>
            <Text style={styles.recordLabel}>Justificada</Text>
            <View style={[styles.pill, absence?.justified ? styles.pillYes : styles.pillNo]}>
              <Text style={[styles.pillText, absence?.justified ? styles.pillYesText : styles.pillNoText]}>
                {absence?.justified ? "SI" : "NO"}
              </Text>
            </View>
            {absence?.justified && !!absence.absence?.state?.name && (
              <Text style={[styles.pillText, { color: absence.absence.state.color || "#374151" }]}>
                {absence.absence.state.name}
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={[styles.recordSection, styles.recordSectionSpaced]}>
        <Text style={styles.recordTitle}>
          Tardanza -{" "}
          {latenessDate ? (
            <>
              {latenessDate}
              {!!lateness?.overtime && (
                <Text style={styles.recordOvertime}> - {lateness.overtime}</Text>
              )}
            </>
          ) : (
            <Text style={styles.recordEmpty}>sin registro</Text>
          )}
        </Text>
        {latenessDate && !!lateness?.type && (
          <View style={styles.recordRow}>
            <Text style={styles.recordLabel}>Tipo</Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{latenessTypeLabel(lateness.type)}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
