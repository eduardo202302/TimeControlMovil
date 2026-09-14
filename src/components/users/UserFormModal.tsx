import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useResponsive } from "@/constants/responsive";
import type { UserFormMode } from "../../utils/userFormRules";
import type { SchoolUserRow } from "../../utils/usersRules";
import UserAddressTab from "./UserAddressTab";
import UserBasicInfoTab from "./UserBasicInfoTab";
import UserSchedulesTab from "./UserSchedulesTab";
import UserSettingsTab from "./UserSettingsTab";
import { useUserForm } from "./useUserForm";
import { createUserFormStyles, type UserFormStyles } from "./userFormStyles";

type UserTabId = "info" | "config" | "address" | "schedules";

const TAB_ICONS: Record<UserTabId, React.ComponentProps<typeof Ionicons>["name"]> = {
  info: "person-outline",
  config: "settings-outline",
  address: "location-outline",
  schedules: "calendar-outline",
};

interface UserFormModalProps {
  visible: boolean;
  /** Un solo modal con 3 modos, igual que MtnUserCrud del webapp. */
  mode: UserFormMode;
  /** Fila del listado (tableValue del webapp) — null en "add". */
  user: SchoolUserRow | null;
  token: string | null;
  urlColegio: string | null;
  onClose: () => void;
  /** Tras guardar con éxito (add o edit) — users.tsx refresca el listado. */
  onSaved: () => void;
}

export default function UserFormModal({
  visible,
  mode,
  user,
  token,
  urlColegio,
  onClose,
  onSaved,
}: UserFormModalProps) {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createUserFormStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {/* Montado solo mientras está visible: cada apertura arranca con su
            propio snapshot, igual que HolidaysFormModal. */}
        {visible && (
          <UserForm
            key={mode === "add" ? "add" : `${mode}-${user?.id}`}
            initialMode={mode}
            user={user}
            token={token}
            urlColegio={urlColegio}
            isTablet={isTablet}
            styles={styles}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </View>
    </Modal>
  );
}

interface UserFormProps {
  initialMode: UserFormMode;
  user: SchoolUserRow | null;
  token: string | null;
  urlColegio: string | null;
  isTablet: boolean;
  styles: UserFormStyles;
  onClose: () => void;
  onSaved: () => void;
}

function UserForm({
  initialMode,
  user,
  token,
  urlColegio,
  isTablet,
  styles,
  onClose,
  onSaved,
}: UserFormProps) {
  const ctl = useUserForm({ initialMode, userId: user?.id ?? null, token, urlColegio });
  const [activeTab, setActiveTab] = useState<UserTabId>("info");
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false);

  const infoHasError = Object.values(ctl.errors).some(Boolean);

  const tabs = useMemo(
    () =>
      [
        { id: "info" as const, label: "Info. básica", hasError: infoHasError },
        { id: "config" as const, label: "Configuración", hasError: false },
        { id: "address" as const, label: "Dirección", hasError: false },
        // Horarios: solo si el rol seleccionado aplica horario y la escuela
        // tiene control de tiempo (isAccessControl).
        ...(ctl.showScheduleTab
          ? [{ id: "schedules" as const, label: "Horarios", hasError: !!ctl.scheduleError }]
          : []),
      ],
    [infoHasError, ctl.showScheduleTab, ctl.scheduleError],
  );
  // Si el tab activo deja de estar visible (cambio de rol), vuelve a Info.
  const currentTab: UserTabId = tabs.some((tab) => tab.id === activeTab) ? activeTab : "info";

  const fullName = user?.user?.fullName ?? ctl.detail?.user?.fullName ?? "";
  const userId = user?.id ?? ctl.detail?.id;
  const title = ctl.mode === "add" ? "Agregar Usuario" : `Usuario: ${fullName} - Id: ${String(userId ?? "")}`;

  const requestClose = useCallback(() => {
    if (ctl.isDirty) setExitConfirmVisible(true);
    else onClose();
  }, [ctl.isDirty, onClose]);

  const handleSave = useCallback(async () => {
    const result = await ctl.submit();
    if (!result) return;
    if (result.status === "invalid") {
      setActiveTab(result.tab);
      return;
    }
    if (result.status === "error") return; // el banner muestra ctl.submitError
    onSaved();
    // Aviso del backend cuando el usuario ya existía y se asignó a la entidad.
    if (result.messageAlert) Alert.alert("Usuario", result.messageAlert);
    if (result.mode === "edit") {
      onClose();
      return;
    }
    // Add: el modal queda abierto y limpio, igual que el webapp.
    setActiveTab("info");
  }, [ctl, onSaved, onClose]);

  const renderTabContent = () => {
    switch (currentTab) {
      case "info":
        return <UserBasicInfoTab ctl={ctl} styles={styles} />;
      case "config":
        return <UserSettingsTab ctl={ctl} styles={styles} />;
      case "address":
        return <UserAddressTab ctl={ctl} styles={styles} />;
      case "schedules":
        return <UserSchedulesTab ctl={ctl} styles={styles} />;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={requestClose} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={2}>
          {title}
        </Text>
        {initialMode !== "add" ? (
          // Alterna edit ↔ watch, igual que los mode buttons del IKModal del webapp.
          <TouchableOpacity
            style={[styles.iconBtn, ctl.isWatch && styles.iconBtnActive]}
            onPress={ctl.toggleWatch}
            activeOpacity={0.7}
            accessibilityLabel={ctl.isWatch ? "Editar" : "Solo lectura"}
          >
            <Ionicons
              name={ctl.isWatch ? "eye" : "eye-outline"}
              size={22}
              color={ctl.isWatch ? "#2563EB" : "#6B7280"}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.topBarSpacer} />
        )}
      </View>

      {/* ── Tab bar: mismo patrón que Jornada/Almuerzo/Break de adminpunchinout.tsx ── */}
      <View style={[styles.tabs, isTablet && styles.contentTablet]}>
        {tabs.map((tab) => {
          const active = currentTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.75}
            >
              <Ionicons name={TAB_ICONS[tab.id]} size={18} color={active ? "#fff" : "#2563EB"} />
              <Text
                style={[styles.tabText, active && styles.tabTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {tab.label}
              </Text>
              {tab.hasError && <View style={styles.tabErrorDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {ctl.detailLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Cargando usuario…</Text>
        </View>
      ) : ctl.detailError ? (
        <View style={styles.stateBox}>
          <Ionicons name="alert-circle-outline" size={30} color="#9CA3AF" />
          <Text style={styles.stateText}>{ctl.detailError}</Text>
          <TouchableOpacity onPress={ctl.reloadDetail} activeOpacity={0.75}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!!ctl.submitError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
              <Text style={styles.errorBannerText}>{ctl.submitError}</Text>
            </View>
          )}
          {renderTabContent()}
        </ScrollView>
      )}

      <View style={styles.footer}>
        {ctl.isWatch ? (
          <TouchableOpacity
            style={[styles.footerBtn, styles.cancelBtn]}
            onPress={requestClose}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>Cerrar</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.footerBtn, styles.cancelBtn]}
              onPress={requestClose}
              disabled={ctl.submitting}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, styles.saveBtn, ctl.submitting && styles.saveBtnBusy]}
              onPress={handleSave}
              disabled={ctl.submitting || ctl.detailLoading || !!ctl.detailError}
              activeOpacity={0.8}
            >
              {ctl.submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveText}>{ctl.mode === "add" ? "Guardar" : "Modificar"}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── ¿Salir sin guardar? — mismo confirm de HolidaysFormModal.tsx, con
          los textos del ConfirmModal del webapp. ── */}
      <Modal
        transparent
        visible={exitConfirmVisible}
        animationType="fade"
        onRequestClose={() => setExitConfirmVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Confirmar Cerrar</Text>
            <Text style={styles.confirmMessage}>Está seguro que desea salir del formulario</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity onPress={() => setExitConfirmVisible(false)}>
                <Text style={styles.confirmCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setExitConfirmVisible(false);
                  onClose();
                }}
              >
                <Text style={styles.confirmConfirm}>Salir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
